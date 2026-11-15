import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { VoicesController } from './voices.controller';

@Module({
  imports: [AiModule],
  controllers: [VoicesController],
})
export class VoicesModule {}
