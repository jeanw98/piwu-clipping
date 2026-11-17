import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { presenterUploadSchema, type PresenterDto } from '@piwu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.types';

const MAX_BYTES = 4 * 1024 * 1024;

function sniff(buffer: Buffer): 'png' | 'webp' | null {
  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47) return 'png';
  if (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** The user's on-screen presenter for the "what-if" format (one per account). */
@Injectable()
export class PresenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(userId: string): Promise<PresenterDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { presenterUrl: true, presenterName: true, presenterAt: true },
    });
    return {
      hasImage: Boolean(user.presenterUrl),
      name: user.presenterName,
      updatedAt: user.presenterAt?.toISOString() ?? null,
    };
  }

  /** Stored public URL of the current presenter, or null. */
  async currentUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { presenterUrl: true },
    });
    return user?.presenterUrl ?? null;
  }

  async image(userId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const url = await this.currentUrl(userId);
    if (!url) throw new NotFoundException('No hay presentador');
    const relative = this.storage.toRelativePath(url);
    const buffer = await this.storage.read(relative);
    return { buffer, contentType: relative.endsWith('.webp') ? 'image/webp' : 'image/png' };
  }

  async save(userId: string, body: unknown): Promise<PresenterDto> {
    const parsed = presenterUploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Sube una imagen PNG o WebP (idealmente con fondo transparente).');
    }
    const buffer = Buffer.from(parsed.data.data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      throw new BadRequestException('La imagen debe pesar menos de 4 MB.');
    }
    const kind = sniff(buffer);
    if (!kind) throw new BadRequestException('El archivo no es un PNG o WebP válido.');
    // New file per upload: clips already rendered/queued keep their snapshot.
    const stored = await this.storage.put(
      'references',
      `presenter-${userId}-${Date.now()}.${kind}`,
      buffer,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        presenterUrl: stored.publicUrl,
        presenterName: parsed.data.name?.trim() || null,
        presenterAt: new Date(),
      },
    });
    return this.get(userId);
  }

  async remove(userId: string): Promise<PresenterDto> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { presenterUrl: null, presenterName: null, presenterAt: null },
    });
    return this.get(userId);
  }
}
