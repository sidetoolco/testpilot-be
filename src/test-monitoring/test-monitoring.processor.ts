import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from 'email/email.service';
import { ProlificService } from 'prolific/prolific.service';
import { TestsService } from 'tests/tests.service';
import { forwardRef, Inject } from '@nestjs/common';

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
    @Inject(forwardRef(() => TestsService))
    private readonly testsService: TestsService,
  ) {
    super();
  }

  async process(job: Job<{ studyId: string; testId: string; variationType: string }>) {
    const { studyId, testId, variationType } = job.data;

    try {
      // Get study from Prolific
      const study = await this.prolificService.getStudy(studyId);

      if (!study) {
        throw new Error(`Study ${studyId} not found`);
      }

      const isCompleted = study.status === 'COMPLETED';

      if (isCompleted) {
        this.logger.log(`Study ${studyId} is completed, updating variation status for test ${testId}`);
        
        // Update the specific variation status to complete
        await this.testsService.updateTestVariationStatus('complete', testId, variationType, studyId);
        
        // Check if all variations are complete before marking test as complete
        const allVariationsComplete = await this.testsService.areAllVariationsComplete(testId);
        if (allVariationsComplete) {
          this.logger.log(`All variations complete for test ${testId}, marking test as complete`);
          await this.testsService.updateTestStatus(testId, 'complete');
        } else {
          this.logger.log(`Not all variations complete for test ${testId}, test remains active`);
        }
        
        // Remove job from queue since this variation is completed
        await job.remove();
        
        this.logger.log(`Successfully updated variation ${variationType} for test ${testId}`);
      } else {
        this.logger.log(`Study ${studyId} is not yet completed (status: ${study.status}), sending reminder`);
        await this.emailService.sendTestCompletionReminder(studyId, testId);
        // Trigger retry/backoff instead of silently completing the job
        throw new Error(`Study ${studyId} not completed yet; retrying later via backoff`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process completion check for study ${studyId}: `,
        error,
      );
    }
  }
}
