import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from 'email/email.service';
import { ProlificService } from 'prolific/prolific.service';

@Processor('test-completion', {
  // Reduce polling frequency to save Redis requests
  // Since jobs have 72-hour delays, we don't need frequent polling
  concurrency: 1,
  limiter: {
    max: 1, // Process max 1 job per interval
    duration: 60 * 60 * 1000, // 1 hour interval - much less frequent than default 5 seconds
  },
})
export class TestMonitoringProcessor extends WorkerHost {
  private readonly logger = new Logger(TestMonitoringProcessor.name);

  constructor(
    private readonly prolificService: ProlificService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<{ studyId: string; testId: string }>) {
    const { studyId, testId } = job.data;

    try {
      // Get study from Prolific
      const study = await this.prolificService.getStudy(studyId);

      if (!study) {
        throw new Error(`Study ${studyId} not found`);
      }

      const isCompleted = study.status === 'COMPLETED';

      if (!isCompleted) {
        await this.emailService.sendTestCompletionReminder(studyId, testId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process completion check for study ${studyId}: `,
        error,
      );
    }
  }
}
