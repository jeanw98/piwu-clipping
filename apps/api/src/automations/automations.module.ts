import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AUTOMATION_QUEUE } from '@piwu/shared';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ClipsModule } from '../clips/clips.module';
import { AutomationPlanner } from './automation-planner';
import { AutomationProcessor } from './automation.processor';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

@Module({
  imports: [BullModule.registerQueue({ name: AUTOMATION_QUEUE }), AiModule, AuthModule, ClipsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationPlanner, AutomationProcessor],
})
export class AutomationsModule {}
