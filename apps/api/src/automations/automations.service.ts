import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, type Automation, type AutomationRun } from '@prisma/client';
import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import {
  AUTOMATION_CLIP_FORMAT,
  AUTOMATION_FORMATS,
  AUTOMATION_QUEUE,
  JobStatus,
  automationBlockSchema,
  automationInputSchema,
  type AutomationBlock,
  type AutomationDto,
  type AutomationRunDto,
  type AutomationRunItemDto,
  type ClipLanguage,
} from '@piwu/shared';
import { ElevenLabsService } from '../ai/elevenlabs.service';
import type { AuthUser } from '../auth/types/auth-user';
import { ClipsService } from '../clips/clips.service';
import { youtubeVideoId } from '../clips/youtube-media';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.types';
import { AutomationPlanner } from './automation-planner';
import { isDue, localParts, nextRunAt } from './automation-time';
import { buildRunZip, slugify, type ZipVideo } from './automation-zip';

export interface AutomationJobData {
  runId: string;
}

const TERMINAL = new Set<string>([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.AWAITING_APPROVAL]);
/** A run that is still waiting on jobs after this long is zipped with what finished. */
const RUN_MAX_MS = 18 * 60 * 60 * 1000;

type RunItem = AutomationRunItemDto;

@Injectable()
export class AutomationsService implements OnModuleInit {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clips: ClipsService,
    private readonly planner: AutomationPlanner,
    private readonly elevenLabs: ElevenLabsService,
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<AutomationJobData>,
  ) {}

  /** Every 5 min: fire due automations and advance running runs. */
  async onModuleInit() {
    try {
      await this.queue.add('sweep', { runId: '' }, {
        repeat: { every: 5 * 60 * 1000 },
        jobId: 'automation-sweep',
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (error) {
      this.logger.warn(`Could not register automation sweep: ${(error as Error).message}`);
    }
  }

  // ---------- CRUD ----------

  async list(userId: string): Promise<AutomationDto[]> {
    const rows = await this.prisma.automation.findMany({
      where: { userId },
      include: { runs: { orderBy: { seq: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row, row.runs[0] ?? null));
  }

  async get(userId: string, id: string): Promise<AutomationDto> {
    const row = await this.owned(userId, id);
    const last = await this.prisma.automationRun.findFirst({ where: { automationId: id }, orderBy: { seq: 'desc' } });
    return this.toDto(row, last);
  }

  async create(userId: string, body: unknown): Promise<AutomationDto> {
    const input = this.parse(body);
    await this.assertProject(userId, input.projectId);
    const now = new Date();
    const row = await this.prisma.automation.create({
      data: {
        userId,
        ...input,
        projectId: input.projectId ?? null,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        // Created after today's time: start tomorrow instead of firing right away.
        lastScheduledDate: isDue({ ...input, lastScheduledDate: null }, now).due
          ? localParts(now, input.timezone).date
          : null,
      },
    });
    return this.toDto(row, null);
  }

  async update(userId: string, id: string, body: unknown): Promise<AutomationDto> {
    const existing = await this.owned(userId, id);
    const input = this.parse(body);
    await this.assertProject(userId, input.projectId);
    const now = new Date();
    const timeChanged =
      existing.runHour !== input.runHour || existing.runMinute !== input.runMinute || existing.timezone !== input.timezone;
    const row = await this.prisma.automation.update({
      where: { id },
      data: {
        ...input,
        projectId: input.projectId ?? null,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        // Moving the time earlier than "now" must not fire a second run today.
        ...(timeChanged && isDue({ ...input, lastScheduledDate: null }, now).due
          ? { lastScheduledDate: localParts(now, input.timezone).date }
          : {}),
      },
    });
    return this.get(userId, row.id);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    await this.owned(userId, id);
    await this.prisma.automation.delete({ where: { id } });
    return { success: true };
  }

  async runs(userId: string, id: string): Promise<AutomationRunDto[]> {
    await this.owned(userId, id);
    const rows = await this.prisma.automationRun.findMany({
      where: { automationId: id },
      orderBy: { seq: 'desc' },
      take: 30,
    });
    return rows.map((row) => this.toRunDto(row));
  }

  async run(userId: string, runId: string): Promise<AutomationRunDto> {
    return this.toRunDto(await this.ownedRun(userId, runId));
  }

  /** "Ejecutar ahora": an extra run today, independent of the schedule. */
  async runNow(userId: string, id: string): Promise<AutomationRunDto> {
    const automation = await this.owned(userId, id);
    const active = await this.prisma.automationRun.findFirst({
      where: { automationId: id, status: { in: ['PLANNING', 'RUNNING', 'ZIPPING'] } },
    });
    if (active) {
      throw new BadRequestException(`Ya hay una ejecución en curso (día ${active.seq}). Espera a que termine.`);
    }
    return this.toRunDto(await this.createRun(automation, 'manual'));
  }

  async download(userId: string, runId: string) {
    const run = await this.ownedRun(userId, runId);
    if (!run.zipPath || !run.zipName) throw new NotFoundException('El ZIP todavía no está listo');
    const access = await this.storage.getAccessUrl(run.zipPath, {
      downloadFilename: run.zipName,
      expiresInSec: 60 * 60,
    });
    return { ...access, filename: run.zipName, relativePath: run.zipPath };
  }

  async readZip(relativePath: string): Promise<Buffer> {
    return this.storage.read(relativePath);
  }

  // ---------- Scheduling ----------

  async sweep(): Promise<void> {
    const now = new Date();
    const automations = await this.prisma.automation.findMany({ where: { enabled: true } });
    for (const automation of automations) {
      const { due, localDate } = isDue(automation, now);
      if (!due) continue;
      // Claim today's run atomically so two sweeps never fire it twice.
      const claimed = await this.prisma.automation.updateMany({
        where: {
          id: automation.id,
          OR: [{ lastScheduledDate: null }, { lastScheduledDate: { not: localDate } }],
        },
        data: { lastScheduledDate: localDate },
      });
      if (claimed.count === 1) {
        try {
          await this.createRun(automation, 'schedule');
        } catch (error) {
          this.logger.error(`Automation ${automation.id} could not start: ${(error as Error).message}`);
        }
      }
    }

    // A run stuck in PLANNING (process restarted mid-plan) is retried by its queue job;
    // after 2 h it is marked failed.
    await this.prisma.automationRun.updateMany({
      where: { status: 'PLANNING', createdAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
      data: { status: 'FAILED', error: 'La planificación no terminó (el servidor se reinició).', finishedAt: now },
    });

    const running = await this.prisma.automationRun.findMany({ where: { status: { in: ['RUNNING', 'ZIPPING'] } } });
    for (const run of running) {
      try {
        await this.advance(run, now);
      } catch (error) {
        this.logger.error(`Run ${run.id} could not advance: ${(error as Error).message}`);
      }
    }
  }

  private async createRun(automation: Automation, trigger: 'schedule' | 'manual'): Promise<AutomationRun> {
    const localDate = localParts(new Date(), automation.timezone).date;
    let run: AutomationRun | null = null;
    for (let attempt = 0; attempt < 3 && !run; attempt++) {
      const last = await this.prisma.automationRun.findFirst({
        where: { automationId: automation.id },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      try {
        run = await this.prisma.automationRun.create({
          data: {
            automationId: automation.id,
            userId: automation.userId,
            seq: (last?.seq ?? 0) + 1,
            localDate,
            trigger,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    if (!run) throw new Error('No se pudo crear la ejecución');
    await this.queue.add('run', { runId: run.id }, { jobId: `run-${run.id}`, removeOnComplete: true, removeOnFail: 50 });
    this.logger.log(`Automation ${automation.name}: run ${run.seq} (${trigger}) queued`);
    return run;
  }

  // ---------- Execution ----------

  /** Plans today's content and creates the clip jobs (queue worker). */
  async execute(runId: string): Promise<void> {
    const run = await this.prisma.automationRun.findUnique({
      where: { id: runId },
      include: { automation: true },
    });
    if (!run || run.status !== 'PLANNING') return;
    const automation = run.automation;
    const user = await this.authUser(automation.userId);

    try {
      const blocks = this.blocksOf(automation);
      const history = await this.prisma.automationRun.findMany({
        where: { automationId: automation.id, id: { not: run.id } },
        orderBy: { seq: 'desc' },
        // ~2 months of days: "never repeat" needs a long memory.
        take: 60,
        select: { topics: true, items: true },
      });
      const recentTopics = [
        ...new Set(
          history.flatMap((past) => [
            ...past.topics,
            ...((past.items as unknown as RunItem[]) ?? []).map((item) => item.topic ?? '').filter(Boolean),
          ]),
        ),
      ];
      const usedSources = await this.prisma.clipJob.findMany({
        where: { userId: automation.userId, sourceType: 'youtube', sourceUrl: { not: null } },
        select: { sourceUrl: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });
      const usedVideoIds = new Set(
        usedSources.map((job) => youtubeVideoId(job.sourceUrl)).filter((id): id is string => Boolean(id)),
      );

      const plan = await this.planner.plan({
        localDate: run.localDate,
        topicHint: automation.topicHint,
        useTrends: automation.useTrends,
        blocks,
        recentTopics,
        usedVideoIds,
      });

      const items: RunItem[] = [];
      const voices = new Map<string, string | null>();
      for (const block of blocks) {
        const kind = AUTOMATION_FORMATS[block.format].kind;
        const planned = plan.items.filter((item) => item.blockId === block.id);
        for (let index = 0; index < block.count; index++) {
          const entry = planned[index];
          const item: RunItem = {
            blockId: block.id,
            format: block.format,
            language: block.language,
            kind,
            topic: entry?.topic || null,
            prompt: entry?.kind === 'prompt' ? entry.prompt : null,
            sourceUrl: entry?.kind === 'youtube' ? entry.sourceUrl : null,
            caption: entry?.kind === 'prompt' ? entry.caption || null : null,
            clipJobId: null,
            status: 'PENDING',
            error: null,
          };
          items.push(item);
          if (!entry) {
            item.status = JobStatus.FAILED;
            item.error = 'La IA no generó este video en el plan.';
            continue;
          }
          try {
            if (entry.kind === 'prompt') {
              const voiceId = block.voiceId || (await this.nativeVoice(block.language, voices));
              const script = await this.clips.createScript(user, {
                sourceType: 'prompt',
                prompt: entry.prompt,
                durationSec: block.durationSec,
                language: block.language,
                platform: block.platform,
                orientation: 'portrait',
                resolution: '1080p',
                visualStyle: entry.visualStyle,
                motion: entry.motion,
                voiceId: voiceId ?? undefined,
                projectId: automation.projectId ?? undefined,
                ...(AUTOMATION_CLIP_FORMAT[block.format]
                  ? { format: AUTOMATION_CLIP_FORMAT[block.format], presenter: block.presenter !== false }
                  : {}),
              });
              item.clipJobId = script.jobId;
              await this.linkJob(script.jobId, run.id);
              await this.clips.approveScript(user, script.jobId, {});
              item.status = JobStatus.PENDING;
            } else {
              if (!entry.sourceUrl) throw new Error(entry.error ?? 'Sin video de YouTube');
              const job = await this.clips.generate(user, {
                sourceType: 'youtube',
                sourceUrl: entry.sourceUrl,
                // A focus makes the highlight picker prefer viral moments; the URL means "best moments".
                prompt: entry.focus || entry.sourceUrl,
                durationSec: block.durationSec,
                // 1–2 are automation-only (more sources, fewer cuts each); the picker accepts 1–8.
                clipCount: (block.clipCount ?? 3) as 3 | 5 | 8,
                language: block.language,
                platform: block.platform,
                orientation: 'portrait',
                resolution: '1080p',
                stylePreset: 'viral',
                projectId: automation.projectId ?? undefined,
              });
              item.clipJobId = job.jobId;
              await this.linkJob(job.jobId, run.id);
              item.status = JobStatus.PENDING;
            }
          } catch (error) {
            item.status = JobStatus.FAILED;
            item.error = (error as Error).message.slice(0, 300);
            this.logger.warn(`Run ${run.seq} item failed: ${item.error}`);
          }
        }
      }

      const started = items.some((item) => item.clipJobId && item.status !== JobStatus.FAILED);
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          topics: plan.topics,
          items: items as unknown as Prisma.InputJsonValue,
          status: started ? 'RUNNING' : 'FAILED',
          error: started ? null : 'No se pudo iniciar ningún video. Revisa los errores de cada uno.',
          finishedAt: started ? null : new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Run ${run.id} failed while planning: ${(error as Error).message}`);
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: (error as Error).message.slice(0, 500), finishedAt: new Date() },
      });
    }
  }

  /** Refreshes item statuses; when every job is done, builds the ZIP. */
  private async advance(run: AutomationRun, now: Date): Promise<void> {
    const items = (run.items as unknown as RunItem[]) ?? [];
    const jobIds = items.map((item) => item.clipJobId).filter((id): id is string => Boolean(id));
    const jobs = await this.prisma.clipJob.findMany({
      where: { id: { in: jobIds } },
      include: { variants: { orderBy: { index: 'asc' } } },
    });
    const byId = new Map(jobs.map((job) => [job.id, job]));
    for (const item of items) {
      if (!item.clipJobId) continue;
      const job = byId.get(item.clipJobId);
      if (!job) {
        item.status = JobStatus.FAILED;
        item.error = item.error ?? 'El clip fue borrado.';
        continue;
      }
      item.status = job.status;
      if (job.status === JobStatus.FAILED) item.error = job.errorMessage ?? item.error;
    }
    const pending = items.some((item) => item.clipJobId && !TERMINAL.has(item.status));
    const expired = now.getTime() - run.createdAt.getTime() > RUN_MAX_MS;
    if (pending && !expired) {
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: { items: items as unknown as Prisma.InputJsonValue },
      });
      return;
    }

    await this.prisma.automationRun.update({
      where: { id: run.id },
      data: { status: 'ZIPPING', items: items as unknown as Prisma.InputJsonValue },
    });

    const videos: ZipVideo[] = [];
    let number = 0;
    for (const item of items) {
      const job = item.clipJobId ? byId.get(item.clipJobId) : null;
      if (!job || job.status !== JobStatus.COMPLETED) continue;
      const format = AUTOMATION_FORMATS[item.format]?.label ?? item.format;
      const renders = job.variants.filter((variant) => variant.outputVideoUrl && variant.status === JobStatus.COMPLETED);
      const outputs = renders.length
        ? renders.map((variant) => ({ url: variant.outputVideoUrl as string, title: variant.title || job.title || '' }))
        : job.outputVideoUrl
          ? [{ url: job.outputVideoUrl, title: job.title || '' }]
          : [];
      for (const output of outputs) {
        number += 1;
        const lang = item.language.slice(0, 2);
        videos.push({
          relativePath: this.storage.toRelativePath(output.url),
          name: `${String(number).padStart(2, '0')}-${lang}-${slugify(item.format, 14)}-${slugify(output.title)}`,
          summary: [
            `Formato: ${format} · Idioma: ${item.language}`,
            `Título: ${output.title || '(sin título)'}`,
            item.topic ? `Tema: ${item.topic}` : null,
            item.sourceUrl ? `Fuente: ${item.sourceUrl}` : null,
            item.caption ? `Caption sugerido: ${item.caption}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }
    }

    const automation = await this.prisma.automation.findUnique({ where: { id: run.automationId } });
    const zipName = `videosdia${run.seq}.zip`;
    let zipPath: string | null = null;
    let count = 0;
    if (videos.length) {
      const built = await buildRunZip(
        this.storage,
        videos,
        `${automation?.name ?? 'Automatización'} · Día ${run.seq} · ${run.localDate}\nTemas: ${run.topics.join(', ') || '-'}`,
      );
      try {
        const stored = await this.storage.putFile('renders', `automation-${run.id}-${zipName}`, built.zipPath);
        zipPath = stored.relativePath;
        count = built.count;
      } finally {
        await fs.rm(built.dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    const failed = items.some((item) => item.status !== JobStatus.COMPLETED);
    await this.prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: count === 0 ? 'FAILED' : failed ? 'PARTIAL' : 'COMPLETED',
        error: count === 0 ? 'Ningún video terminó correctamente.' : null,
        zipPath,
        zipName: zipPath ? zipName : null,
        videoCount: count,
        items: items as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    this.logger.log(`Run ${run.id} finished: ${count} videos → ${zipPath ?? 'no zip'}`);
  }

  // ---------- Helpers ----------

  /** First voice native to the language (account voice, else adds a library one). */
  private async nativeVoice(language: ClipLanguage, cache: Map<string, string | null>): Promise<string | null> {
    if (cache.has(language)) return cache.get(language) ?? null;
    let voiceId: string | null = null;
    try {
      const voices = await this.elevenLabs.listVoices(language);
      const account = voices.find((voice) => voice.source === 'account' && voice.matchesLanguage);
      if (account) {
        voiceId = account.id;
      } else {
        const library = voices.find((voice) => voice.source === 'library' && voice.matchesLanguage && voice.publicOwnerId);
        if (library?.publicOwnerId) {
          voiceId = await this.elevenLabs.addLibraryVoice(library.publicOwnerId, library.id, library.name);
        }
      }
    } catch (error) {
      this.logger.warn(`No native voice for ${language}: ${(error as Error).message.slice(0, 160)}`);
    }
    cache.set(language, voiceId);
    return voiceId;
  }

  private async linkJob(jobId: string, runId: string) {
    await this.prisma.clipJob.update({ where: { id: jobId }, data: { automationRunId: runId } });
  }

  private async authUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('El usuario de la automatización ya no existe');
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private parse(body: unknown) {
    const parsed = automationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join('.') || 'datos'}: ${issue.message}`),
      );
    }
    return parsed.data;
  }

  private blocksOf(automation: Automation): AutomationBlock[] {
    return ((automation.blocks as unknown[]) ?? [])
      .map((block) => automationBlockSchema.safeParse(block))
      .filter((result) => result.success)
      .map((result) => result.data as AutomationBlock);
  }

  private async assertProject(userId: string, projectId?: string | null) {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new BadRequestException('Proyecto no encontrado');
  }

  private async owned(userId: string, id: string): Promise<Automation> {
    const row = await this.prisma.automation.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Automatización no encontrada');
    return row;
  }

  private async ownedRun(userId: string, runId: string): Promise<AutomationRun> {
    const run = await this.prisma.automationRun.findFirst({ where: { id: runId, userId } });
    if (!run) throw new NotFoundException('Ejecución no encontrada');
    return run;
  }

  private toDto(row: Automation, last: AutomationRun | null): AutomationDto {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      runHour: row.runHour,
      runMinute: row.runMinute,
      timezone: row.timezone,
      topicHint: row.topicHint,
      useTrends: row.useTrends,
      projectId: row.projectId,
      blocks: this.blocksOf(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      nextRunAt: nextRunAt(row, new Date())?.toISOString() ?? null,
      lastRun: last ? this.toRunDto(last) : null,
    };
  }

  private toRunDto(run: AutomationRun): AutomationRunDto {
    return {
      id: run.id,
      automationId: run.automationId,
      seq: run.seq,
      localDate: run.localDate,
      trigger: run.trigger === 'manual' ? 'manual' : 'schedule',
      status: run.status as AutomationRunDto['status'],
      topics: run.topics,
      items: (run.items as unknown as RunItem[]) ?? [],
      error: run.error,
      zipName: run.zipName,
      videoCount: run.videoCount,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }
}
