import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JobStatus,
  PUBLISH_QUEUE,
  type PostPrivacy,
  type PostStatus,
  type ScheduledPostDto,
  type SocialProvider,
} from '@piwu/shared';
import type { ScheduledPost, SocialAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SchedulePostDto } from './social.dto';

/** Max horizon for scheduling (days). */
const MAX_DAYS_AHEAD = 180;
export const PUBLISH_ATTEMPTS = 3;

export interface PublishJobData {
  postId: string;
}

@Injectable()
export class PostsService implements OnModuleInit {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PUBLISH_QUEUE) private readonly queue: Queue<PublishJobData>,
  ) {}

  /** Safety net: every 5 min, enqueue overdue SCHEDULED posts (e.g. Redis was flushed). */
  async onModuleInit() {
    try {
      await this.queue.add('sweep', { postId: '' }, {
        repeat: { every: 5 * 60 * 1000 },
        jobId: 'publish-sweep',
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (error) {
      this.logger.warn(`Could not register publish sweep: ${(error as Error).message}`);
    }
  }

  async enqueue(post: Pick<ScheduledPost, 'id' | 'scheduledAt' | 'attempts'>, suffix = '') {
    const delay = Math.max(0, post.scheduledAt.getTime() - Date.now());
    await this.queue.add(
      'publish',
      { postId: post.id },
      {
        jobId: `${post.id}${suffix}`,
        delay,
        attempts: PUBLISH_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async schedule(userId: string, dto: SchedulePostDto): Promise<ScheduledPostDto[]> {
    const clip = await this.prisma.clipJob.findFirst({
      where: { id: dto.clipJobId, userId },
      include: { variants: true },
    });
    if (!clip) throw new NotFoundException('Clip no encontrado');
    if (clip.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Solo se pueden publicar clips terminados');
    }
    const variant = dto.variantId ? clip.variants.find((v) => v.id === dto.variantId) : null;
    if (dto.variantId && !variant) throw new BadRequestException('Variante no encontrada');
    const videoUrl = variant ? variant.outputVideoUrl : clip.outputVideoUrl;
    if (!videoUrl) throw new BadRequestException('Este clip todavía no tiene video renderizado');

    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId, id: { in: dto.accountIds } },
    });
    if (accounts.length !== new Set(dto.accountIds).size) {
      throw new BadRequestException('Alguna cuenta seleccionada no existe');
    }

    const now = Date.now();
    const when = dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(now);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('Fecha inválida');
    if (when.getTime() < now - 60_000) throw new BadRequestException('La fecha ya pasó');
    if (when.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) {
      throw new BadRequestException(`Se puede programar hasta ${MAX_DAYS_AHEAD} días adelante`);
    }

    const created: Array<ScheduledPost & { socialAccount: SocialAccount }> = [];
    for (const account of accounts) {
      const post = await this.prisma.scheduledPost.create({
        data: {
          userId,
          clipJobId: clip.id,
          variantId: variant?.id ?? null,
          socialAccountId: account.id,
          provider: account.provider,
          title: dto.title?.trim() || clip.title || null,
          caption: dto.caption.trim(),
          privacy: dto.privacy ?? 'public',
          scheduledAt: when,
        },
        include: { socialAccount: true },
      });
      await this.enqueue(post);
      created.push(post);
    }
    return created.map((post) => this.toDto(post));
  }

  async list(userId: string, clipJobId?: string): Promise<ScheduledPostDto[]> {
    const rows = await this.prisma.scheduledPost.findMany({
      where: { userId, ...(clipJobId ? { clipJobId } : {}) },
      include: { socialAccount: true },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
    return rows.map((post) => this.toDto(post));
  }

  async cancel(userId: string, id: string): Promise<ScheduledPostDto> {
    const post = await this.owned(userId, id);
    if (post.status !== 'SCHEDULED') {
      throw new BadRequestException('Solo se pueden cancelar publicaciones programadas');
    }
    const updated = await this.prisma.scheduledPost.update({
      where: { id },
      data: { status: 'CANCELED' },
      include: { socialAccount: true },
    });
    // Best effort: the worker also skips non-SCHEDULED posts.
    await this.queue.remove(id).catch(() => undefined);
    return this.toDto(updated);
  }

  async retry(userId: string, id: string): Promise<ScheduledPostDto> {
    const post = await this.owned(userId, id);
    if (post.status !== 'FAILED') throw new BadRequestException('Solo se reintentan publicaciones fallidas');
    const updated = await this.prisma.scheduledPost.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: new Date(), errorMessage: null },
      include: { socialAccount: true },
    });
    await this.enqueue(updated, `:retry:${updated.attempts}`);
    return this.toDto(updated);
  }

  /** Overdue SCHEDULED posts with no live job → enqueue again. */
  async sweep(): Promise<number> {
    const overdue = await this.prisma.scheduledPost.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lt: new Date(Date.now() - 2 * 60_000) } },
      take: 50,
    });
    let added = 0;
    for (const post of overdue) {
      const job = await this.queue.getJob(post.id);
      const state = job ? await job.getState() : 'missing';
      if (state === 'missing' || state === 'completed' || state === 'failed' || state === 'unknown') {
        await this.enqueue(post, `:sweep:${Date.now()}`);
        added += 1;
      }
    }
    if (added) this.logger.log(`Publish sweep re-enqueued ${added} overdue post(s)`);
    return added;
  }

  private async owned(userId: string, id: string) {
    const post = await this.prisma.scheduledPost.findFirst({ where: { id, userId } });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return post;
  }

  toDto(post: ScheduledPost & { socialAccount: SocialAccount }): ScheduledPostDto {
    return {
      id: post.id,
      clipJobId: post.clipJobId,
      variantId: post.variantId,
      socialAccountId: post.socialAccountId,
      provider: post.provider as SocialProvider,
      accountName: post.socialAccount.displayName,
      title: post.title,
      caption: post.caption,
      privacy: post.privacy as PostPrivacy,
      scheduledAt: post.scheduledAt.toISOString(),
      status: post.status as PostStatus,
      attempts: post.attempts,
      externalPostId: post.externalPostId,
      externalUrl: post.externalUrl,
      errorMessage: post.errorMessage,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    };
  }
}
