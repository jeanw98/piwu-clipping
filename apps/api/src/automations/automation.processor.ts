import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AUTOMATION_QUEUE } from '@piwu/shared';
import { AutomationsService, type AutomationJobData } from './automations.service';

/** Plans daily runs and sweeps schedules (5 min). Rendering stays on the clipping queue. */
@Processor(AUTOMATION_QUEUE, {
  // Planning calls Claude + web search + YouTube search; zipping downloads every render.
  lockDuration: 30 * 60 * 1000,
  concurrency: 1,
})
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(private readonly automations: AutomationsService) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<void> {
    if (job.name === 'sweep') {
      await this.automations.sweep();
      return;
    }
    if (job.name === 'run') {
      this.logger.log(`Planning automation run ${job.data.runId}`);
      await this.automations.execute(job.data.runId);
    }
  }
}
