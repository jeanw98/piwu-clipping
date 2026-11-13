import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CLIPPING_QUEUE,
  DEFAULT_CAPTION_STYLE,
  JobStatus,
  MediaAssetType,
  mergeReferenceMeta,
  metaFromLegacyUrls,
  normalizeCaptionStyle,
  normalizeReferenceMeta,
  planScriptTimeline,
  buildCreativeBrief,
  detectSocialVideoSource,
  estimateActualClipCost,
  isLinkClipSource,
  resolveMotion,
  resolveVideoFormat,
  urlsFromReferenceMeta,
  videoSceneCap,
  VISUAL_STYLE_LOCK,
  type ClipLanguage,
  type ClipMotion,
  type ClipOrientation,
  type GenerateClipResponse,
  type GeneratedScript,
  type PaginatedResponse,
  type ClipJobDto,
  type StylePreset,
  type TypedReferenceMeta,
  type VisualStyle,
} from '@piwu/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.types';
import { AnthropicService } from '../ai/anthropic.service';
import type { AuthUser } from '../auth/types/auth-user';
import { GenerateClipDto, ListClipsQueryDto, ScriptReferenceDto } from './dto/clips.dto';
import { mapClipJob } from './clips.mapper';
import type { ClippingJobPayload } from './clipping.processor';

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly anthropic: AnthropicService,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(CLIPPING_QUEUE) private readonly clippingQueue: Queue,
  ) {}

  async generate(
    user: AuthUser,
    dto: GenerateClipDto,
  ): Promise<GenerateClipResponse> {
    const detected = detectSocialVideoSource(dto.sourceUrl);
    const sourceType = detected ?? dto.sourceType ?? 'prompt';
    if (isLinkClipSource(sourceType)) {
      if (!dto.sourceUrl?.trim() || !detectSocialVideoSource(dto.sourceUrl)) {
        throw new BadRequestException(
          'A public YouTube or Instagram URL is required',
        );
      }
    } else {
      return this.createScript(user, dto);
    }

    const sourceUrl = dto.sourceUrl!.trim();
    const project = await this.resolveProject(user, dto.projectId);
    const job = await this.prisma.clipJob.create({
      data: {
        userId: user.id,
        projectId: project?.id ?? null,
        prompt: dto.prompt?.trim() || sourceUrl,
        sourceType,
        sourceUrl,
        captionStyle:
          normalizeCaptionStyle(dto.captionStyle) ?? DEFAULT_CAPTION_STYLE,
        stylePreset: dto.stylePreset ?? 'viral',
        clipCount: dto.clipCount ?? 3,
        visualStyle:
          dto.visualStyle ??
          (project?.defaultVisualStyle as VisualStyle | undefined) ??
          'ugc',
        motion:
          dto.motion ??
          (project?.defaultMotion as ClipMotion | undefined) ??
          'auto',
        durationSec: dto.durationSec ?? 30,
        orientation: dto.orientation ?? 'portrait',
        resolution: dto.resolution ?? '1080p',
        platform: dto.platform ?? 'tiktok',
        language: dto.language ?? 'es-LA',
        status: JobStatus.PENDING,
        progress: 0,
      },
    });

    await this.enqueue(job.id, user.id);
    return { jobId: job.id, status: JobStatus.PENDING };
  }

  async createScript(
    user: AuthUser,
    dto: GenerateClipDto,
  ): Promise<GenerateClipResponse> {
    if (isLinkClipSource(dto.sourceType)) {
      throw new BadRequestException('Script review is only for prompt clips');
    }
    if (!dto.prompt || dto.prompt.trim().length < 10) {
      throw new BadRequestException('Prompt must be at least 10 characters');
    }

    const project = await this.resolveProject(user, dto.projectId);
    const job = await this.prisma.clipJob.create({
      data: {
        userId: user.id,
        projectId: project?.id ?? null,
        prompt: dto.prompt.trim(),
        sourceType: 'prompt',
        sourceUrl: null,
        captionStyle:
          normalizeCaptionStyle(dto.captionStyle) ?? DEFAULT_CAPTION_STYLE,
        stylePreset: dto.stylePreset ?? 'viral',
        clipCount: dto.clipCount ?? 5,
        visualStyle:
          dto.visualStyle ??
          (project?.defaultVisualStyle as VisualStyle | undefined) ??
          'ugc',
        motion:
          dto.motion ??
          (project?.defaultMotion as ClipMotion | undefined) ??
          'auto',
        durationSec: dto.durationSec ?? 30,
        orientation: dto.orientation ?? 'portrait',
        resolution: dto.resolution ?? '1080p',
        platform: dto.platform ?? 'tiktok',
        language: dto.language ?? 'es-LA',
        status: JobStatus.GENERATING_SCRIPT,
        progress: 10,
      },
    });

    try {
      const jobMeta = await this.storeTypedReferences(
        job.id,
        dto.references ?? [],
      );
      const projectMeta = (project?.references ?? []).map((ref) => ({
        role: ref.role as TypedReferenceMeta['role'],
        url: ref.url,
        label: ref.label ?? undefined,
      }));
      const referenceMeta = mergeReferenceMeta(jobMeta, projectMeta);
      const referenceUrls = urlsFromReferenceMeta(referenceMeta);
      const script = await this.buildScript({
        prompt: job.prompt,
        stylePreset: job.stylePreset,
        durationSec: job.durationSec,
        orientation: job.orientation,
        language: job.language,
        visualStyle: job.visualStyle,
        motion: job.motion,
        referenceMeta,
        projectDescription: project?.description,
        projectMemory: project?.memorySummary,
      });

      await this.prisma.clipJob.update({
        where: { id: job.id },
        data: {
          referenceUrls,
          referenceMeta: referenceMeta as object[],
          scriptJson: script as object,
          title: script.title,
          audioScript: script.audioScript,
          status: JobStatus.AWAITING_APPROVAL,
          progress: 20,
        },
      });

      return {
        jobId: job.id,
        status: JobStatus.AWAITING_APPROVAL,
        script,
      };
    } catch (error) {
      await this.prisma.clipJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: (error as Error).message,
        },
      });
      throw error;
    }
  }

  async regenerateScript(
    user: AuthUser,
    jobId: string,
  ): Promise<GenerateClipResponse> {
    const job = await this.requireOwnedJob(user, jobId);
    if (isLinkClipSource(job.sourceType)) {
      throw new BadRequestException('Link jobs have no script to regenerate');
    }
    if (
      job.status !== JobStatus.AWAITING_APPROVAL &&
      job.status !== JobStatus.FAILED
    ) {
      throw new BadRequestException('Script can only be regenerated while reviewing');
    }

    await this.prisma.clipJob.update({
      where: { id: job.id },
      data: { status: JobStatus.GENERATING_SCRIPT, progress: 10 },
    });

    try {
      const project = job.projectId
        ? await this.prisma.project.findUnique({
            where: { id: job.projectId },
            include: { references: true },
          })
        : null;
      const jobMeta =
        normalizeReferenceMeta(job.referenceMeta).length > 0
          ? normalizeReferenceMeta(job.referenceMeta)
          : metaFromLegacyUrls(job.referenceUrls ?? []);
      const projectMeta = (project?.references ?? []).map((ref) => ({
        role: ref.role as TypedReferenceMeta['role'],
        url: ref.url,
        label: ref.label ?? undefined,
      }));
      const referenceMeta = mergeReferenceMeta(jobMeta, projectMeta);
      const script = await this.buildScript({
        prompt: job.prompt,
        stylePreset: job.stylePreset,
        durationSec: job.durationSec,
        orientation: job.orientation,
        language: job.language,
        visualStyle: job.visualStyle,
        motion: job.motion,
        referenceMeta,
        projectDescription: project?.description,
        projectMemory: project?.memorySummary,
      });

      await this.prisma.clipJob.update({
        where: { id: job.id },
        data: {
          scriptJson: script as object,
          title: script.title,
          audioScript: script.audioScript,
          referenceMeta: referenceMeta as object[],
          referenceUrls: urlsFromReferenceMeta(referenceMeta),
          status: JobStatus.AWAITING_APPROVAL,
          progress: 20,
          errorMessage: null,
        },
      });

      return {
        jobId: job.id,
        status: JobStatus.AWAITING_APPROVAL,
        script,
      };
    } catch (error) {
      await this.prisma.clipJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: (error as Error).message,
        },
      });
      throw error;
    }
  }

  async approveScript(
    user: AuthUser,
    jobId: string,
  ): Promise<GenerateClipResponse> {
    const job = await this.requireOwnedJob(user, jobId);
    if (job.status !== JobStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('Only reviewed scripts can be approved');
    }
    if (!job.scriptJson) {
      throw new BadRequestException('No script to approve');
    }

    await this.prisma.clipJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PENDING,
        progress: 25,
      },
    });
    await this.enqueue(job.id, user.id);
    return { jobId: job.id, status: JobStatus.PENDING };
  }

  async list(
    user: AuthUser,
    query: ListClipsQueryDto,
  ): Promise<PaginatedResponse<ClipJobDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = {
      userId: user.id,
      ...(query.projectId ? { projectId: query.projectId } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.clipJob.count({ where }),
      this.prisma.clipJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          assets: true,
          variants: { orderBy: { score: 'desc' } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      data: rows.map(mapClipJob),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(user: AuthUser, id: string): Promise<ClipJobDto> {
    const job = await this.prisma.clipJob.findUnique({
      where: { id },
      include: {
        assets: { orderBy: { sceneIndex: 'asc' } },
        variants: { orderBy: { score: 'desc' } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Clip job not found');
    }
    if (job.userId !== user.id) {
      throw new ForbiddenException();
    }
    const dto = mapClipJob(job);
    if (!dto.costJson && job.status === 'COMPLETED') {
      dto.costJson = estimateActualClipCost({
        sourceType: job.sourceType || 'prompt',
        durationSec: job.durationSec || 30,
        audioScript: job.audioScript,
        videoModel: this.config.get('MINIMAX_VIDEO_MODEL', { infer: true }),
        videoResolution: this.config.get('MINIMAX_VIDEO_RESOLUTION', {
          infer: true,
        }),
        assets: (job.assets ?? []).map((asset) => ({
          type: asset.type,
          durationSec: asset.durationSec,
          url: asset.url,
        })),
        motion: job.motion,
        prompt: job.prompt,
      });
    }
    return dto;
  }

  async getDownloadUrl(
    user: AuthUser,
    id: string,
    variantId?: string,
  ): Promise<{ url: string; direct: boolean; filename: string }> {
    const job = await this.prisma.clipJob.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!job) {
      throw new NotFoundException('Clip job not found');
    }
    if (job.userId !== user.id) {
      throw new ForbiddenException();
    }

    let outputUrl = job.outputVideoUrl;
    let filename = `${job.id}.mp4`;
    if (variantId) {
      const variant = job.variants.find((item) => item.id === variantId);
      if (!variant?.outputVideoUrl) {
        throw new NotFoundException('Variant render not found');
      }
      outputUrl = variant.outputVideoUrl;
      filename = `${job.id}-v${variant.index}.mp4`;
    }
    if (!outputUrl) {
      throw new NotFoundException('No render available yet');
    }

    const relativePath = this.storage.toRelativePath(outputUrl);
    const access = await this.storage.getAccessUrl(relativePath, {
      downloadFilename: filename,
      expiresInSec: 60 * 30,
    });
    return { ...access, filename };
  }

  async delete(user: AuthUser, id: string): Promise<{ success: true }> {
    const job = await this.prisma.clipJob.findUnique({
      where: { id },
      include: { assets: true, variants: true },
    });
    if (!job) {
      throw new NotFoundException('Clip job not found');
    }
    if (job.userId !== user.id) {
      throw new ForbiddenException();
    }

    const paths: string[] = [];
    for (const asset of job.assets) {
      paths.push(this.storage.toRelativePath(asset.url));
    }
    for (const url of job.referenceUrls ?? []) {
      paths.push(this.storage.toRelativePath(url));
    }
    if (job.audioUrl) {
      paths.push(this.storage.toRelativePath(job.audioUrl));
    }
    if (job.outputVideoUrl) {
      paths.push(this.storage.toRelativePath(job.outputVideoUrl));
    }
    for (const variant of job.variants) {
      if (
        variant.outputVideoUrl &&
        variant.outputVideoUrl !== job.outputVideoUrl
      ) {
        paths.push(this.storage.toRelativePath(variant.outputVideoUrl));
      }
    }

    await this.storage.deleteMany(paths);
    await this.prisma.clipJob.delete({ where: { id } });
    return { success: true };
  }

  private async enqueue(jobId: string, userId: string): Promise<void> {
    const payload: ClippingJobPayload = { jobId, userId };
    await this.clippingQueue.add('process-clip', payload, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  }

  private async requireOwnedJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.clipJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Clip job not found');
    }
    if (job.userId !== user.id) {
      throw new ForbiddenException();
    }
    return job;
  }

  private async resolveProject(user: AuthUser, projectId?: string | null) {
    if (!projectId) return null;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { references: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] } },
    });
    if (!project || project.userId !== user.id) {
      throw new BadRequestException('Invalid project');
    }
    return project;
  }

  private async storeTypedReferences(
    jobId: string,
    references: ScriptReferenceDto[],
  ): Promise<TypedReferenceMeta[]> {
    const meta: TypedReferenceMeta[] = [];
    for (let index = 0; index < Math.min(references.length, 7); index++) {
      const ref = references[index];
      const role =
        ref.role ??
        (index === 0 ? 'protagonist' : 'style');
      const mime = (ref.mime || 'image/png').toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw new BadRequestException('Reference images must be JPEG, PNG, or WebP');
      }
      const buffer = Buffer.from(ref.data, 'base64');
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException('Each reference image must be under 5MB');
      }
      const ext =
        mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
      const stored = await this.storage.put(
        'references',
        `${jobId}-${role}-${index}.${ext}`,
        buffer,
      );
      meta.push({
        role: role as TypedReferenceMeta['role'],
        url: stored.publicUrl,
        label: ref.label,
      });
    }
    return normalizeReferenceMeta(meta);
  }

  private async buildScript(
    input: {
      prompt: string;
      stylePreset: string;
      durationSec: number;
      orientation: string;
      language: string;
      visualStyle: string;
      motion: string;
      referenceMeta: TypedReferenceMeta[];
      projectDescription?: string | null;
      projectMemory?: string | null;
    },
  ): Promise<GeneratedScript> {
    const visualStyle = (input.visualStyle as VisualStyle) || 'ugc';
    const styleLock = VISUAL_STYLE_LOCK[visualStyle] ?? VISUAL_STYLE_LOCK.ugc;
    const motion = resolveMotion(input.motion as ClipMotion, input.prompt);
    const format = resolveVideoFormat(
      (input.orientation as ClipOrientation) || 'portrait',
    );
    const referenceImages = await this.loadReferenceImages(input.referenceMeta);
    const seriesContext = [
      input.projectDescription
        ? `SERIES / PROJECT BRIEF:\n${input.projectDescription.trim()}`
        : '',
      input.projectMemory?.trim()
        ? `SERIES MEMORY (prior clips — keep protagonist, locations, and look consistent):\n${input.projectMemory.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const brief = [
      seriesContext,
      buildCreativeBrief({
        prompt: input.prompt,
        visualStyle,
        motion: input.motion,
        durationSec: input.durationSec || 30,
      }),
    ]
      .filter(Boolean)
      .join('\n\n');

    /** Stills v2 (wire `fake`): all IMAGE stills; visual style from styleLock, not HTML cartoon. */
    const stillsV2 = motion === 'fake';
    const script = await this.anthropic.generateScript(brief, {
      stylePreset: (input.stylePreset as StylePreset) || 'viral',
      durationSec: input.durationSec || 30,
      orientation: (input.orientation as ClipOrientation) || 'portrait',
      aspectLabel: format.aspectLabel,
      language: (input.language as ClipLanguage) || 'es-LA',
      visualStyle,
      maxVideoScenes: videoSceneCap(input.durationSec || 30, motion),
      referenceImages,
      hasSeriesMemory: Boolean(seriesContext),
    });

    const hasScenery = input.referenceMeta.some((r) => r.role === 'scenery');
    const sceneryLock = hasScenery
      ? 'Environment/location must match the scenery reference images'
      : '';
    const anchor = script.styleAnchor.trim() || styleLock.suffix;
    const mapped = script.scenes.map((scene) => ({
      ...scene,
      type:
        scene.type === MediaAssetType.VIDEO && !stillsV2
          ? MediaAssetType.VIDEO
          : MediaAssetType.IMAGE,
      visualPrompt: [
        anchor,
        scene.visualPrompt,
        styleLock.suffix,
        styleLock.avoid,
        sceneryLock,
      ]
        .filter(Boolean)
        .join('. ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700),
      cartoon: scene.cartoon,
    }));
    const scenes = planScriptTimeline(mapped, input.durationSec || 30);

    return {
      title: script.title,
      audioScript: script.audioScript,
      styleAnchor: script.styleAnchor,
      scenes,
    };
  }

  private async loadReferenceImages(
    meta: TypedReferenceMeta[],
  ): Promise<
    Array<{ mime: string; base64: string; role?: TypedReferenceMeta['role'] }>
  > {
    const images: Array<{
      mime: string;
      base64: string;
      role?: TypedReferenceMeta['role'];
    }> = [];
    for (const item of meta.slice(0, 7)) {
      const relative = this.storage.toRelativePath(item.url);
      const buffer = await this.storage.read(relative);
      // Cap payload for vision APIs / Leonardo init (~1.2MB).
      if (buffer.length > 1.2 * 1024 * 1024) {
        continue;
      }
      const mime = relative.endsWith('.jpg') || relative.endsWith('.jpeg')
        ? 'image/jpeg'
        : relative.endsWith('.webp')
          ? 'image/webp'
          : 'image/png';
      images.push({ mime, base64: buffer.toString('base64'), role: item.role });
    }
    return images;
  }
}
