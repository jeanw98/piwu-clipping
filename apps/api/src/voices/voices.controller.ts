import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { languageSchema, type VoiceDto } from '@piwu/shared';
import { ElevenLabsService } from '../ai/elevenlabs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('voices')
@UseGuards(JwtAuthGuard)
export class VoicesController {
  constructor(private readonly elevenLabs: ElevenLabsService) {}

  /** ElevenLabs voices for a clip language, with their free preview samples. */
  @Get()
  async list(@Query('language') language?: string): Promise<VoiceDto[]> {
    const parsed = languageSchema.safeParse(language || undefined);
    try {
      return await this.elevenLabs.listVoices(parsed.success ? parsed.data : 'es-LA');
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }
  }

  /** Adds a public Voice Library voice to the account so clips can use it. */
  @Post('library')
  async addFromLibrary(
    @Body() body: { publicOwnerId?: string; voiceId?: string; name?: string },
  ): Promise<{ voiceId: string }> {
    const ownerId = String(body?.publicOwnerId ?? '').trim();
    const voiceId = String(body?.voiceId ?? '').trim();
    if (!/^[\w-]{4,80}$/.test(ownerId) || !/^[\w-]{4,80}$/.test(voiceId)) {
      throw new BadRequestException('Voz inválida');
    }
    try {
      return { voiceId: await this.elevenLabs.addLibraryVoice(ownerId, voiceId, String(body?.name ?? 'Voz PIWU')) };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
