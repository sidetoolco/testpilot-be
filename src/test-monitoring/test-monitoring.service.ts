import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class TestMonitoringService {
  private readonly logger = new Logger(TestMonitoringService.name);

  constructor(
    @InjectQueue('test-completion') private readonly testCompletionQueue: Queue,
  ) {}

  async scheduleTestCompletionCheck(
    studyId: string,
    testId: string,
    variationType: string,
  ) {
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
            delay: 24 * 60 * 60 * 1000, // 24 hours
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
