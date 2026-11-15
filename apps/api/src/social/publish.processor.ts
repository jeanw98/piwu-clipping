import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { PUBLISH_QUEUE, type PostPrivacy } from '@piwu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.types';
import { PostsService, PUBLISH_ATTEMPTS, type PublishJobData } from './posts.service';
import { SocialService } from './social.service';

/**
 * Publishes scheduled posts when their delayed job fires. Retries with
 * exponential backoff (3 attempts); after the last one the post is FAILED and
 * can be retried from the UI.
 */
@Processor(PUBLISH_QUEUE, {
  // Instagram / TikTok processing can take minutes.
  lockDuration: 15 * 60 * 1000,
  concurrency: 1,
})
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly social: SocialService,
    private readonly posts: PostsService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    if (job.name === 'sweep') {
      await this.posts.sweep();
      return;
    }
    const post = await this.prisma.scheduledPost.findUnique({
      where: { id: job.data.postId },
      include: { socialAccount: true, clipJob: { include: { variants: true } } },
    });
    // Canceled / already published / deleted: nothing to do.
    if (!post || (post.status !== 'SCHEDULED' && post.status !== 'PUBLISHING')) return;
    if (post.scheduledAt.getTime() > Date.now() + 30_000) return; // stale early job

    await this.prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'PUBLISHING', attempts: { increment: 1 } },
    });

    try {
      const variant = post.variantId ? post.clipJob.variants.find((v) => v.id === post.variantId) : null;
      const output = variant?.outputVideoUrl ?? post.clipJob.outputVideoUrl;
      if (!output) throw new Error('El clip no tiene video renderizado');
      const relative = this.storage.toRelativePath(output);
      const [video, videoUrl] = await Promise.all([
        this.storage.read(relative),
        this.storage.getRenderableUrl(relative),
      ]);
      const { tokens, profile } = await this.social.credentials(post.socialAccount);
      const adapter = this.social.adapter(post.provider);
      const result = await adapter.publish(tokens, profile, {
        video,
        videoUrl,
        title: post.title ?? post.clipJob.title ?? '',
        caption: post.caption,
        privacy: post.privacy as PostPrivacy,
      });
      await this.prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl ?? null,
          errorMessage: null,
          publishedAt: new Date(),
        },
      });
      this.logger.log(`Published post ${post.id} on ${post.provider} → ${result.externalUrl ?? result.externalPostId}`);
    } catch (error) {
      const raw = (error as Error).message;
      // Auth problems won't fix themselves: fail now and ask to re-link.
      const auth = isAuthError(raw);
      const message = (auth ? `${raw} — vuelve a vincular la cuenta en Cuentas` : raw).slice(0, 500);
      const last = auth || job.attemptsMade + 1 >= (job.opts.attempts ?? PUBLISH_ATTEMPTS);
      await this.prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: last ? 'FAILED' : 'SCHEDULED', errorMessage: message },
      });
      this.logger.warn(`Publish ${post.id} (${post.provider}) failed${last ? '' : ', will retry'}: ${message}`);
      if (!last) throw error;
      if (auth) throw new UnrecoverableError(message);
    }
  }
}

/** 401 / revoked or expired grants / missing refresh token. */
export function isAuthError(message: string): boolean {
  return /\b401\b|invalid_grant|invalid_token|access_token_invalid|token expired|vuelve a vincular|OAuthException/i.test(message);
}
