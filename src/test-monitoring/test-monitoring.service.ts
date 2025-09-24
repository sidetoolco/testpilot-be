import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class TestMonitoringService {
  private readonly logger = new Logger(TestMonitoringService.name);

  constructor(
    @Optional() @InjectQueue('test-completion') private readonly testCompletionQueue?: Queue,
  ) {}

  async scheduleTestCompletionCheck(
    studyId: string,
    testId: string,
    variationType: string,
  ) {
    // Skip scheduling if Redis/BullMQ is not available (N8N handles completion)
    if (!this.testCompletionQueue) {
      this.logger.log(`Redis/BullMQ not available - skipping 24h monitoring for study ${studyId}. N8N will handle completion.`);
      return;
    }

    try {
      // Schedule the job to run after 24 hours
      await this.testCompletionQueue.add(
        'check-test-completion',
        {
          studyId,
          testId,
          variationType,
        },
        {
          delay: 24 * 60 * 60 * 1000, // 24 hours to milliseconds
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 15 * 60 * 1000, // 15 minutes base delay for retries
          },
        },
      );

      this.logger.log(`Scheduled completion check for study ${studyId} (variation: ${variationType})`);
    } catch (error) {
      this.logger.error(
        `Failed to schedule completion check for study ${studyId}:`,
        error,
      );
    }
  }
}
