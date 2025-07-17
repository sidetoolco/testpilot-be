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
  ) {
    try {
      // Schedule the job to run after 72 hours
      await this.testCompletionQueue.add(
        'check-test-completion',
        {
          studyId,
          testId,
        },
        {
          delay: 72 * 60 * 60 * 1000,
          attempts: 1,
          backoff: {
            type: 'exponential',
            delay: 600000,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule completion check for study ${studyId}:`,
        error,
      );
    }
  }
}
