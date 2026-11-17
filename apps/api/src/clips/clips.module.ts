import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CLIPPING_QUEUE } from '@piwu/shared';
import { AiModule } from '../ai/ai.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RemotionModule } from '../remotion/remotion.module';
import { PresenterModule } from '../presenter/presenter.module';
import { ClippingProcessor } from './clipping.processor';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { MgAssetGeneratorService } from './mg-asset-generator.service';
import { SourceUploadService } from './source-upload.service';
import { YtDlpUpdaterService } from './ytdlp-updater.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: CLIPPING_QUEUE }),
    AiModule,
    RemotionModule,
    RealtimeModule,
    PresenterModule,
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    ClippingProcessor,
    MgAssetGeneratorService,
    SourceUploadService,
    YtDlpUpdaterService,
  ],
  exports: [ClipsService],
})
export class ClipsModule {}
