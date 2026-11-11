import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { ElevenLabsService } from './elevenlabs.service';
import { HtmlCartoonService } from './html-cartoon.service';
import { LeonardoService } from './leonardo.service';
import { MinimaxService } from './minimax.service';
import { RunwayService } from './runway.service';
import { WhisperService } from './whisper.service';

@Module({
  providers: [
    AnthropicService,
    ElevenLabsService,
    WhisperService,
    LeonardoService,
    MinimaxService,
    RunwayService,
    HtmlCartoonService,
  ],
  exports: [
    AnthropicService,
    ElevenLabsService,
    WhisperService,
    LeonardoService,
    MinimaxService,
    RunwayService,
    HtmlCartoonService,
  ],
})
export class AiModule {}
