import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CLIPPING_QUEUE } from '@piwu/shared';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RemotionModule } from '../remotion/remotion.module';
import { ClippingProcessor } from './clipping.processor';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: CLIPPING_QUEUE }),
    AiModule,
    RemotionModule,
    RealtimeModule,
  ],
  controllers: [ClipsController],
  providers: [ClipsService, ClippingProcessor],
})
export class ClipsModule {}
