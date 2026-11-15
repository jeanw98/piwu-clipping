import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PUBLISH_QUEUE } from '@piwu/shared';
import { AuthModule } from '../auth/auth.module';
import { PostsService } from './posts.service';
import { PublishProcessor } from './publish.processor';
import { PostsController, SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [BullModule.registerQueue({ name: PUBLISH_QUEUE }), AuthModule],
  controllers: [SocialController, PostsController],
  providers: [SocialService, PostsService, PublishProcessor],
})
export class SocialModule {}
