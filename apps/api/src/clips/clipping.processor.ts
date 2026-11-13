import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import {
  CLIPPING_QUEUE,
  DEFAULT_CAPTION_STYLE,
  JobStatus,
  MediaAssetType,
  alignSceneDurationsToSpeech,
  buildCreativeBrief,
  estimateActualClipCost,
  fitSceneDurations,
  leonardoSize,
  normalizeCaptionStyle,
  normalizeSceneCartoon,
  resolveMotion,
  resolveVideoFormat,
  usesCaptionSafeZone,
  videoSceneCap,
  VISUAL_STYLE_LOCK,
  type ClipCostBreakdown,
  type ClipLanguage,
  type ClipMotion,
  type ClipOrientation,
  type ClipResolution,
  type RemotionCompositionProps,
  type SceneCartoon,
  type StylePreset,
  type VisualStyle,
  type WordTimestamp,
} from '@piwu/shared';
import { JobStatus as PrismaJobStatus } from '@prisma/client';
import { AnthropicService } from '../ai/anthropic.service';
import { ElevenLabsService } from '../ai/elevenlabs.service';
import { LeonardoService } from '../ai/leonardo.service';
import { MinimaxService } from '../ai/minimax.service';
import { WhisperService } from '../ai/whisper.service';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RemotionService } from '../remotion/remotion.service';
import { createCanvas, isUsableMedia } from '../ai/placeholder-image';
import { StorageService } from '../storage/storage.types';
import {
  cutClip,
  downloadYoutube,
  extractAudioMp3,
  extractPosterJpeg,
  mediaDuration,
  removeDir,
  sampleFocusFrames,
} from './youtube-media';

export interface ClippingJobPayload {
  jobId: string;
  userId: string;
}

type AssetResult = {
  sceneIndex: number;
  prompt: string;
  type: MediaAssetType;
  url: string;
  relativePath: string;
  durationSec: number;
  byteLength: number;
  mediaDurationSec?: number;
  cartoon?: SceneCartoon;
};

@Processor(CLIPPING_QUEUE)
export class ClippingProcessor extends WorkerHost {
  private readonly logger = new Logger(ClippingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly whisper: WhisperService,
    private readonly leonardo: LeonardoService,
    private readonly minimax: MinimaxService,
    private readonly storage: StorageService,
    private readonly remotion: RemotionService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    super();
  }

  async process(job: Job<ClippingJobPayload>): Promise<void> {
    const { jobId, userId } = job.data;
    this.logger.log(`Processing clip job ${jobId}`);

    try {
      const clip = await this.prisma.clipJob.findUniqueOrThrow({
        where: { id: jobId },
      });

      const format = resolveVideoFormat(
        (clip.orientation as ClipOrientation) || 'portrait',
        (clip.resolution as ClipResolution) || '1080p',
      );

      if ((clip.sourceType || 'prompt') === 'youtube') {
        await this.renderYoutubeHighlight(clip, jobId, userId, format);
        return;
      }

      const visualStyle = (clip.visualStyle as VisualStyle) || 'ugc';
      const styleLock = VISUAL_STYLE_LOCK[visualStyle] ?? VISUAL_STYLE_LOCK.ugc;
      const motion = resolveMotion(clip.motion as ClipMotion, clip.prompt);
      const approved = clip.scriptJson as
        | {
            title?: string;
            audioScript?: string;
            styleAnchor?: string;
            scenes?: Array<{
              index: number;
              narration: string;
              visualPrompt: string;
              type: string;
              durationSec: number;
              startSec?: number;
              endSec?: number;
              cartoon?: SceneCartoon;
            }>;
          }
        | null;

      /** Stills v2 (wire id `fake`): per-scene Leonardo stills + Remotion camera — no HTML. */
      const stillsV2 = motion === 'fake';
      let script;
      if (approved?.scenes?.length && approved.audioScript) {
        this.logger.log(`Job ${jobId} using approved scriptJson`);
        script = {
          title: approved.title || 'Untitled',
          audioScript: approved.audioScript,
          styleAnchor: approved.styleAnchor || '',
          scenes: approved.scenes.map((scene) => ({
            ...scene,
            type:
              scene.type === MediaAssetType.VIDEO && !stillsV2
                ? MediaAssetType.VIDEO
                : MediaAssetType.IMAGE,
            cartoon: normalizeSceneCartoon(
              scene.cartoon,
              scene.visualPrompt,
            ),
          })),
        };
      } else {
        await this.updateProgress(jobId, userId, JobStatus.GENERATING_SCRIPT, 15);
        const brief = buildCreativeBrief({
          prompt: clip.prompt,
          visualStyle,
          motion: clip.motion,
          durationSec: clip.durationSec || 30,
        });
        script = await this.anthropic.generateScript(brief, {
          stylePreset: (clip.stylePreset as StylePreset) || 'viral',
          durationSec: clip.durationSec || 30,
          orientation: (clip.orientation as ClipOrientation) || 'portrait',
          aspectLabel: format.aspectLabel,
          language: (clip.language as ClipLanguage) || 'es-LA',
          visualStyle,
          maxVideoScenes: videoSceneCap(clip.durationSec || 30, motion),
        });
        const anchor = script.styleAnchor.trim() || styleLock.suffix;
        script.scenes = script.scenes.map((scene) => ({
          ...scene,
          type:
            scene.type === MediaAssetType.VIDEO && !stillsV2
              ? MediaAssetType.VIDEO
              : MediaAssetType.IMAGE,
          visualPrompt: [anchor, scene.visualPrompt, styleLock.suffix, styleLock.avoid]
            .filter(Boolean)
            .join('. ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 700),
          cartoon: normalizeSceneCartoon(scene.cartoon, scene.visualPrompt),
        }));
      }

      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          title: script.title,
          audioScript: script.audioScript,
        },
      });

      await this.updateProgress(jobId, userId, JobStatus.GENERATING_AUDIO, 40);
      const spoken = await this.elevenLabs.synthesizeAligned(script.audioScript);
      const audioBuffer = spoken.audio;
      const hasRealAudio = audioBuffer.length > 0;
      const audioStored = hasRealAudio
        ? await this.storage.put('audio', `${jobId}.mp3`, audioBuffer)
        : null;
      const timestamps = spoken.words;

      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          audioUrl: audioStored?.publicUrl ?? null,
          timestampsJson: timestamps as unknown as object,
        },
      });

      await this.updateProgress(jobId, userId, JobStatus.GENERATING_ASSETS, 70);
      await this.prisma.mediaAsset.deleteMany({ where: { clipJobId: jobId } });

      const targetDurationSec = clip.durationSec || 30;
      const audioDurationSec = Math.max(timestamps.at(-1)?.end ?? 0, 0);
      const finalDurationSec = Math.max(
        audioDurationSec > 0 ? audioDurationSec + 0.35 : targetDurationSec,
        4,
      );
      const alignedScenes = alignSceneDurationsToSpeech(
        script.scenes,
        timestamps,
        finalDurationSec,
      );

      let assetResults: AssetResult[] = [];

      if (stillsV2) {
        this.logger.log(
          `Job ${jobId} Stills v2 — per-scene Leonardo stills + dynamic camera (no HTML/Hailuo)`,
        );
      }

      const imageSize = leonardoSize(
        (clip.orientation as ClipOrientation) || 'portrait',
      );
      let finishedScenes = 0;
      const generated = await this.mapLimit(script.scenes, 3, async (scene) => {
        const result = await this.generateSceneAsset(jobId, scene, {
          imageSize,
          visualStyle,
        });
        finishedScenes += 1;
        const progress =
          70 + Math.floor((finishedScenes / script.scenes.length) * 15);
        await this.updateProgress(
          jobId,
          userId,
          JobStatus.GENERATING_ASSETS,
          Math.min(progress, 85),
        );
        return result;
      });

      let lastGood: AssetResult | null = null;
      for (const scene of script.scenes) {
        let result =
          generated.find((item) => item.sceneIndex === scene.index) ??
          (await this.storeAbstractFallback(
            jobId,
            scene.index,
            scene.visualPrompt,
            scene.durationSec,
          ));
        if (result.byteLength < 1024 || !result.relativePath) {
          if (lastGood) {
            this.logger.warn(
              `Scene ${scene.index} unusable — carrying forward scene ${lastGood.sceneIndex}`,
            );
            result = {
              ...lastGood,
              sceneIndex: scene.index,
              prompt: scene.visualPrompt,
              durationSec: scene.durationSec,
              type: lastGood.type,
            };
          } else {
            result = await this.storeAbstractFallback(
              jobId,
              scene.index,
              scene.visualPrompt,
              scene.durationSec,
            );
          }
        }
        if (result.byteLength >= 1024 && result.relativePath) {
          lastGood = result;
        }
        await this.prisma.mediaAsset.create({
          data: {
            clipJobId: jobId,
            sceneIndex: result.sceneIndex,
            prompt: result.prompt,
            type: result.type,
            url: result.url,
            durationSec: result.durationSec,
          },
        });
        assetResults.push(result);
      }

      await this.updateProgress(jobId, userId, JobStatus.RENDERING, 90);

      const durationByIndex = new Map(
        alignedScenes.map((scene) => [scene.index, scene.durationSec]),
      );

      const timedAssets = alignedScenes.length
        ? assetResults.map((asset) => ({
            ...asset,
            durationSec:
              durationByIndex.get(asset.sceneIndex) ?? asset.durationSec,
            cartoon:
              asset.cartoon ??
              normalizeSceneCartoon(
                script.scenes.find((s) => s.index === asset.sceneIndex)
                  ?.cartoon,
                asset.prompt,
              ),
          }))
        : fitSceneDurations(assetResults, finalDurationSec);

      let speechCursor = 0;
      const measuredScenes = timedAssets.map((asset) => {
        const startSec = Math.round(speechCursor * 100) / 100;
        const endSec =
          Math.round((speechCursor + asset.durationSec) * 100) / 100;
        speechCursor = endSec;
        const sourceScene = alignedScenes.find(
          (scene) => scene.index === asset.sceneIndex,
        );
        return {
          index: asset.sceneIndex,
          narration: sourceScene?.narration ?? '',
          visualPrompt: asset.prompt,
          type: asset.type,
          durationSec: asset.durationSec,
          startSec,
          endSec,
          cartoon:
            asset.cartoon ??
            normalizeSceneCartoon(sourceScene?.cartoon, asset.prompt),
        };
      });

      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          scriptJson: {
            title: script.title,
            audioScript: script.audioScript,
            styleAnchor: script.styleAnchor,
            scenes: measuredScenes,
          } as object,
        },
      });

      await Promise.all(
        timedAssets.map((asset) =>
          this.prisma.mediaAsset.updateMany({
            where: { clipJobId: jobId, sceneIndex: asset.sceneIndex },
            data: { durationSec: asset.durationSec },
          }),
        ),
      );

      const assetsForRender = await Promise.all(
        timedAssets.map(async (asset) => {
          const proceduralPlaceholder =
            asset.url.startsWith('procedural://') || !asset.relativePath;
          const url = proceduralPlaceholder
            ? ''
            : asset.byteLength < 1024
              ? ''
              : await this.storage.getRenderableUrl(asset.relativePath);
          return {
            sceneIndex: asset.sceneIndex,
            type: asset.type,
            url,
            durationSec: asset.durationSec,
            prompt: asset.prompt,
            mediaDurationSec: asset.mediaDurationSec,
            cartoon:
              asset.cartoon ??
              normalizeSceneCartoon(
                measuredScenes.find((s) => s.index === asset.sceneIndex)
                  ?.cartoon,
                asset.prompt,
              ),
          };
        }),
      );

      const compositionProps: RemotionCompositionProps = {
        title: script.title,
        audioUrl:
          hasRealAudio && audioStored
            ? await this.storage.getRenderableUrl(audioStored.relativePath)
            : '',
        assets: assetsForRender,
        whisperTimestamps: timestamps as WordTimestamp[],
        scenes: alignedScenes,
        width: format.width,
        height: format.height,
        fps: format.fps,
        targetDurationSec: finalDurationSec,
        captionStyle:
          normalizeCaptionStyle(clip.captionStyle) ?? DEFAULT_CAPTION_STYLE,
        captionSafeZone: usesCaptionSafeZone(clip.platform),
        // Stills v2 → dynamic camera on Leonardo stills; otherwise classic Ken Burns
        imageMotion: stillsV2 ? 'dynamic' : 'kenburns',
      };
      const render = await this.remotion.renderClip(jobId, compositionProps);
      const coverUrl = await this.storeCoverFromRender(
        jobId,
        render.relativePath,
        timedAssets,
      );

      const costJson = this.buildCostBreakdown(
        { ...clip, sourceType: clip.sourceType, motion, prompt: clip.prompt },
        {
          assets: timedAssets.map((asset) => ({
            type: asset.type,
            durationSec: asset.durationSec,
            url: asset.url,
          })),
          audioScript: script.audioScript,
        },
      );

      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          status: PrismaJobStatus.COMPLETED,
          progress: 100,
          outputVideoUrl: render.publicUrl,
          coverUrl,
          costJson: costJson as object,
        },
      });

      this.realtime.emitJobCompleted(userId, {
        jobId,
        status: JobStatus.COMPLETED,
        progress: 100,
        title: script.title,
      });
      this.logger.log(`Clip job ${jobId} completed → ${render.publicUrl}`);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Job ${jobId} failed: ${message}`);
      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          status: PrismaJobStatus.FAILED,
          errorMessage: message,
        },
      });
      this.realtime.emitJobFailed(userId, {
        jobId,
        status: JobStatus.FAILED,
        progress: 0,
        errorMessage: message,
      });
      throw error;
    }
  }

  private async renderYoutubeHighlight(
    clip: {
      sourceUrl: string | null;
      prompt: string;
      durationSec: number | null;
      stylePreset: string | null;
      captionStyle: unknown;
      clipCount: number | null;
      platform: string | null;
    },
    jobId: string,
    userId: string,
    format: { width: number; height: number; fps: number },
  ): Promise<void> {
    const sourceUrl = clip.sourceUrl || clip.prompt;
    const targetDurationSec = clip.durationSec || 30;
    const clipCount = clip.clipCount || 5;
    let workDir: string | null = null;

    try {
      await this.updateProgress(jobId, userId, JobStatus.GENERATING_SCRIPT, 15);
      const download = await downloadYoutube(sourceUrl);
      workDir = download.dir;

      await this.updateProgress(jobId, userId, JobStatus.GENERATING_AUDIO, 40);
      const audioParts = await extractAudioMp3(download.videoPath, download.dir);
      let words: WordTimestamp[] = [];
      let offset = 0;
      for (const part of audioParts) {
        const audio = await fs.readFile(part);
        const partWords = await this.whisper.transcribeWords(audio, '');
        words.push(
          ...partWords.map((word) => ({
            word: word.word,
            start: word.start + offset,
            end: word.end + offset,
          })),
        );
        offset += await mediaDuration(part);
      }
      if (words.length < 8) {
        throw new Error('Could not transcribe enough speech from this video');
      }

      const focus =
        clip.sourceUrl && clip.prompt.trim() === clip.sourceUrl.trim()
          ? ''
          : clip.prompt;
      const picked = await this.anthropic.pickHighlights(
        words,
        targetDurationSec,
        clipCount,
        clip.stylePreset || 'viral',
        focus,
      );

      await this.updateProgress(jobId, userId, JobStatus.GENERATING_ASSETS, 70);
      await this.prisma.mediaAsset.deleteMany({ where: { clipJobId: jobId } });
      await this.prisma.clipVariant.deleteMany({ where: { clipJobId: jobId } });

      const frames = await sampleFocusFrames(
        download.videoPath,
        download.dir,
        picked.clips,
      );
      const subjects = await this.anthropic.locateSubjects(
        frames.map((frame) => ({ id: frame.id, base64: frame.base64 })),
      );

      const cuts = [];
      for (let index = 0; index < picked.clips.length; index++) {
        const moment = picked.clips[index];
        const focusPoints = frames
          .filter((frame) => frame.momentIndex === index)
          .map((frame) => ({
            timeSec: frame.timeSec,
            x: subjects.get(frame.id)?.x ?? 0.5,
            y: subjects.get(frame.id)?.y ?? 0.38,
          }));
        const cut = await cutClip({
          videoPath: download.videoPath,
          dir: download.dir,
          index,
          moment,
          width: format.width,
          height: format.height,
          fps: format.fps,
          focus: focusPoints,
          words,
        });
        const videoBuffer = await fs.readFile(cut.videoPath);
        const stored = await this.storage.put(
          'assets',
          `${jobId}-highlight-${index}.mp4`,
          videoBuffer,
        );
        await this.prisma.mediaAsset.create({
          data: {
            clipJobId: jobId,
            sceneIndex: index,
            prompt: moment.title,
            type: MediaAssetType.VIDEO,
            url: stored.publicUrl,
            durationSec: cut.durationSec,
          },
        });
        cuts.push({ ...cut, stored, moment });
        const progress =
          70 + Math.floor(((index + 1) / picked.clips.length) * 12);
        await this.updateProgress(
          jobId,
          userId,
          JobStatus.GENERATING_ASSETS,
          Math.min(progress, 82),
        );
      }

      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: { title: picked.title },
      });

      const captionStyle =
        normalizeCaptionStyle(clip.captionStyle) ?? DEFAULT_CAPTION_STYLE;
      const rendered: Array<{
        index: number;
        publicUrl: string;
        score: number;
        title: string;
        words: WordTimestamp[];
        audioUrl: string;
        durationSec: number;
      }> = [];

      for (let index = 0; index < cuts.length; index++) {
        const cut = cuts[index];
        const variant = await this.prisma.clipVariant.create({
          data: {
            clipJobId: jobId,
            index,
            title: cut.moment.title,
            score: cut.moment.score,
            reason: cut.moment.reason,
            startSec: cut.moment.startSec,
            endSec: cut.moment.endSec,
            status: PrismaJobStatus.RENDERING,
          },
        });
        const progress = 82 + Math.floor(((index + 1) / cuts.length) * 16);
        await this.updateProgress(
          jobId,
          userId,
          JobStatus.RENDERING,
          Math.min(progress, 98),
        );
        try {
          const audioBuffer = await fs.readFile(cut.audioPath);
          const audioStored = await this.storage.put(
            'audio',
            `${jobId}-v${index}.mp3`,
            audioBuffer,
          );
          const compositionProps: RemotionCompositionProps = {
            title: cut.moment.title,
            audioUrl: await this.storage.getRenderableUrl(audioStored.relativePath),
            assets: [
              {
                sceneIndex: 0,
                type: MediaAssetType.VIDEO,
                url: await this.storage.getRenderableUrl(cut.stored.relativePath),
                durationSec: cut.durationSec,
                prompt: cut.moment.title,
              },
            ],
            whisperTimestamps: cut.words,
            scenes: [
              {
                index: 0,
                narration: cut.moment.title,
                visualPrompt: cut.moment.title,
                type: MediaAssetType.VIDEO,
                durationSec: cut.durationSec,
              },
            ],
            width: format.width,
            height: format.height,
            fps: format.fps,
            targetDurationSec: cut.durationSec,
            captionStyle,
            captionSafeZone: usesCaptionSafeZone(clip.platform),
          };
          const render = await this.remotion.renderClip(
            jobId,
            compositionProps,
            `${jobId}-v${index}.mp4`,
          );
          await this.prisma.clipVariant.update({
            where: { id: variant.id },
            data: {
              status: PrismaJobStatus.COMPLETED,
              outputVideoUrl: render.publicUrl,
            },
          });
          rendered.push({
            index,
            publicUrl: render.publicUrl,
            score: cut.moment.score,
            title: cut.moment.title,
            words: cut.words,
            audioUrl: audioStored.publicUrl,
            durationSec: cut.durationSec,
          });
        } catch (error) {
          this.logger.warn(
            `Clip ${index} failed: ${(error as Error).message}`,
          );
          await this.prisma.clipVariant.update({
            where: { id: variant.id },
            data: {
              status: PrismaJobStatus.FAILED,
            },
          });
        }
      }

      if (!rendered.length) {
        throw new Error('None of the clips could be rendered');
      }
      const best = [...rendered].sort((a, b) => b.score - a.score)[0];
      const bestRelative = this.storage.toRelativePath(best.publicUrl);
      const coverUrl = await this.storeCoverFromRender(jobId, bestRelative, []);
      const costJson = this.buildCostBreakdown(
        { sourceType: 'youtube', durationSec: clip.durationSec },
        { assets: [], audioScript: null },
      );
      await this.prisma.clipJob.update({
        where: { id: jobId },
        data: {
          status: PrismaJobStatus.COMPLETED,
          progress: 100,
          title: picked.title,
          audioScript: best.words.map((word) => word.word).join(' '),
          audioUrl: best.audioUrl,
          timestampsJson: best.words as unknown as object,
          outputVideoUrl: best.publicUrl,
          coverUrl,
          costJson: costJson as object,
        },
      });
      this.realtime.emitJobCompleted(userId, {
        jobId,
        status: JobStatus.COMPLETED,
        progress: 100,
        title: picked.title,
      });
      this.logger.log(
        `YouTube job ${jobId} completed with ${rendered.length} clips`,
      );
    } finally {
      if (workDir) await removeDir(workDir);
    }
  }

  private async generateSceneAsset(
    jobId: string,
    scene: {
      index: number;
      visualPrompt: string;
      type: string;
      durationSec: number;
    },
    options: {
      imageSize: { width: number; height: number };
      visualStyle: VisualStyle;
    },
  ): Promise<AssetResult> {
    const still = await this.leonardo.generateImage(
      scene.visualPrompt,
      options.imageSize,
    );
    if (!isUsableMedia(still)) {
      return this.storeAbstractFallback(
        jobId,
        scene.index,
        scene.visualPrompt,
        scene.durationSec,
      );
    }

    if (scene.type === MediaAssetType.VIDEO) {
      const motionPrompt = this.buildMotionPrompt(
        scene.visualPrompt,
        options.visualStyle,
      );
      const fromImage = await this.minimax.animateImage({
        image: still,
        prompt: motionPrompt,
        durationSec: scene.durationSec,
        size: options.imageSize,
      });
      this.logger.log(
        `Scene ${scene.index} video via minimax (${fromImage.isVideo ? 'ok' : 'missed'})`,
      );
      if (fromImage.isVideo && isUsableMedia(fromImage.buffer)) {
        return this.storeVideoAsset(
          jobId,
          scene,
          fromImage.buffer,
          fromImage.durationSec,
        );
      }

      this.logger.warn(
        `MiniMax missed scene ${scene.index} — keeping Leonardo IMAGE`,
      );
    }

    const stored = await this.storage.put(
      'assets',
      `${jobId}-scene-${scene.index}.png`,
      still,
    );
    return {
      sceneIndex: scene.index,
      prompt: scene.visualPrompt,
      type: MediaAssetType.IMAGE,
      url: stored.publicUrl,
      relativePath: stored.relativePath,
      durationSec: scene.durationSec,
      byteLength: still.length,
    };
  }

  private buildMotionPrompt(visualPrompt: string, style: VisualStyle): string {
    const base = visualPrompt.replace(/\s+/g, ' ').trim().slice(0, 700);
    const motion =
      style === 'flat-2d' || style === 'anime'
        ? 'same character, limited motion, no morphing, no scene change'
        : 'subtle natural motion, same subject, no scene change, no morphing';
    return `${base}. ${motion}`;
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const run = async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, () => run()),
    );
    return results;
  }

  private async storeVideoAsset(
    jobId: string,
    scene: { index: number; visualPrompt: string; durationSec: number },
    buffer: Buffer,
    mediaDurationSec: number,
  ): Promise<AssetResult> {
    const stored = await this.storage.put(
      'assets',
      `${jobId}-scene-${scene.index}.mp4`,
      buffer,
    );
    return {
      sceneIndex: scene.index,
      prompt: scene.visualPrompt,
      type: MediaAssetType.VIDEO,
      url: stored.publicUrl,
      relativePath: stored.relativePath,
      durationSec: Math.min(scene.durationSec, mediaDurationSec),
      byteLength: buffer.length,
      mediaDurationSec,
    };
  }

  /**
   * Library cover: prefer first Leonardo still URL; else extract a JPEG frame from the MP4.
   */
  private async storeCoverFromRender(
    jobId: string,
    renderRelativePath: string,
    assets: AssetResult[],
  ): Promise<string | null> {
    const still = [...assets]
      .sort((a, b) => a.sceneIndex - b.sceneIndex)
      .find(
        (asset) =>
          asset.type === MediaAssetType.IMAGE &&
          asset.relativePath &&
          asset.byteLength >= 1024 &&
          !asset.url.startsWith('procedural://'),
      );
    if (still?.url) {
      return still.url;
    }

    try {
      const video = await this.storage.read(renderRelativePath);
      const jpeg = await extractPosterJpeg(video);
      const stored = await this.storage.put(
        'assets',
        `${jobId}-cover.jpg`,
        jpeg,
      );
      return stored.publicUrl;
    } catch (error) {
      this.logger.warn(
        `Cover poster extract failed for ${jobId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async storeAbstractFallback(
    jobId: string,
    sceneIndex: number,
    prompt: string,
    durationSec: number,
  ): Promise<AssetResult> {
    const buffer = createCanvas(prompt);
    const stored = await this.storage.put(
      'assets',
      `${jobId}-scene-${sceneIndex}-fallback.png`,
      buffer,
    );
    return {
      sceneIndex,
      prompt,
      type: MediaAssetType.IMAGE,
      url: stored.publicUrl,
      relativePath: stored.relativePath,
      durationSec,
      byteLength: buffer.length,
    };
  }

  private buildCostBreakdown(
    clip: {
      sourceType?: string | null;
      durationSec?: number | null;
      motion?: string | null;
      prompt?: string | null;
    },
    input: {
      assets: Array<{ type: string; durationSec: number; url?: string }>;
      audioScript: string | null;
      spriteCount?: number;
    },
  ): ClipCostBreakdown {
    return estimateActualClipCost({
      sourceType: clip.sourceType || 'prompt',
      durationSec: clip.durationSec || 30,
      audioScript: input.audioScript,
      videoModel: this.config.get('MINIMAX_VIDEO_MODEL', { infer: true }),
      videoResolution: this.config.get('MINIMAX_VIDEO_RESOLUTION', {
        infer: true,
      }),
      assets: input.assets,
      motion: clip.motion ?? undefined,
      prompt: clip.prompt ?? undefined,
      spriteCount: input.spriteCount,
    });
  }

  private async updateProgress(
    jobId: string,
    userId: string,
    status: JobStatus,
    progress: number,
  ): Promise<void> {
    const updated = await this.prisma.clipJob.update({
      where: { id: jobId },
      data: {
        status: status as PrismaJobStatus,
        progress,
      },
    });

    this.realtime.emitJobProgress(userId, {
      jobId,
      status,
      progress,
      title: updated.title,
    });
  }
}
