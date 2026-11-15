import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { VoiceDto } from '@piwu/shared';
import { ElevenLabsService } from '../ai/elevenlabs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('voices')
@UseGuards(JwtAuthGuard)
export class VoicesController {
  constructor(private readonly elevenLabs: ElevenLabsService) {}

  /** ElevenLabs voices with their free preview samples. */
  @Get()
  async list(): Promise<VoiceDto[]> {
    try {
      return await this.elevenLabs.listVoices();
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }
  }
}
