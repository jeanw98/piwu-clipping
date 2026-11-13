import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.types';

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('resolve')
  @UseGuards(JwtAuthGuard)
  async resolveUrl(
    @Query('path') pathParam: string,
    @CurrentUser() user: AuthUser,
    @Query('download') download?: string,
  ): Promise<{ url: string; direct: boolean }> {
    const relativePath = this.normalizePath(pathParam);
    await this.assertOwnsPath(relativePath, user.id);
    const filename = relativePath.split('/').pop() ?? 'file';
    return this.storage.getAccessUrl(relativePath, {
      downloadFilename: download ? filename : undefined,
      expiresInSec: 60 * 30,
    });
  }

  @Get('renders/:filename')
  @UseGuards(JwtAuthGuard)
  async streamRender(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const relativePath = `renders/${filename}`;
    await this.assertOwnsRender(relativePath, user.id);
    return this.serveFile(relativePath, filename, 'video/mp4', res);
  }

  @Get('assets/:filename')
  @UseGuards(JwtAuthGuard)
  async streamAsset(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    return this.streamOwnedMedia('assets', filename, user, res);
  }

  @Get('audio/:filename')
  @UseGuards(JwtAuthGuard)
  async streamAudio(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    return this.streamOwnedMedia('audio', filename, user, res);
  }

  @Get('references/:filename')
  @UseGuards(JwtAuthGuard)
  async streamReference(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    return this.streamOwnedMedia('references', filename, user, res);
  }

  private async streamOwnedMedia(
    category: 'assets' | 'audio' | 'references',
    filename: string,
    user: AuthUser,
    res: Response,
  ): Promise<StreamableFile | void> {
    const relativePath = `${category}/${filename}`;
    await this.assertOwnsPath(relativePath, user.id);

    const contentType =
      category === 'audio'
        ? 'audio/mpeg'
        : filename.endsWith('.mp4')
          ? 'video/mp4'
          : filename.endsWith('.webp')
            ? 'image/webp'
            : filename.endsWith('.jpg') || filename.endsWith('.jpeg')
              ? 'image/jpeg'
              : 'image/png';

    return this.serveFile(relativePath, filename, contentType, res);
  }

  private async assertOwnsRender(
    relativePath: string,
    userId: string,
  ): Promise<void> {
    await this.assertOwnsPath(relativePath, userId);
  }

  private async assertOwnsPath(
    relativePath: string,
    userId: string,
  ): Promise<void> {
    const publicUrl = this.storage.getPublicUrl(relativePath);
    const [job, asset, variant, projectRef, projectCache] = await Promise.all([
      this.prisma.clipJob.findFirst({
        where: {
          userId,
          OR: [
            { outputVideoUrl: publicUrl },
            { audioUrl: publicUrl },
            { coverUrl: publicUrl },
            { referenceUrls: { has: publicUrl } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.mediaAsset.findFirst({
        where: { url: publicUrl, clipJob: { userId } },
        select: { id: true },
      }),
      this.prisma.clipVariant.findFirst({
        where: { outputVideoUrl: publicUrl, clipJob: { userId } },
        select: { id: true },
      }),
      this.prisma.projectReference.findFirst({
        where: { url: publicUrl, project: { userId } },
        select: { id: true },
      }),
      this.prisma.projectAssetCache.findFirst({
        where: { url: publicUrl, project: { userId } },
        select: { id: true },
      }),
    ]);

    if (job || asset || variant || projectRef || projectCache) return;

    const exists = await this.storage.exists(relativePath);
    if (!exists) {
      throw new NotFoundException('File not found');
    }
    throw new ForbiddenException('You do not own this file');
  }

  private normalizePath(pathParam: string): string {
    const cleaned = this.storage.toRelativePath(pathParam || '');
    if (!cleaned || cleaned.includes('..')) {
      throw new NotFoundException('Invalid path');
    }
    return cleaned;
  }

  private async serveFile(
    relativePath: string,
    filename: string,
    contentType: string,
    res: Response,
  ): Promise<StreamableFile | void> {
    const access = await this.storage.getAccessUrl(relativePath, {
      expiresInSec: 60 * 30,
    });
    if (access.direct) {
      res.redirect(302, access.url);
      return;
    }

    const buffer = await this.storage.read(relativePath);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(Readable.from(buffer));
  }
}
