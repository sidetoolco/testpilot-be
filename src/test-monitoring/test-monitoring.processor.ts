import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from 'email/email.service';
import { ProlificService } from 'prolific/prolific.service';
import { TestsService } from 'tests/tests.service';

@Processor('test-completion', {
  // Disable polling completely - worker will only wake up when jobs are available
  concurrency: 1,
  blockingConnection: true,
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
        
        // Use centralized completion logic
        const completionResult = await this.testsService.finalizeIfComplete(testId);
        
        if (completionResult.completed) {
          this.logger.log(`Test ${testId} completion finalized: status=${completionResult.testStatus}`);
          
          // Note: AI insights are not generated in 24-hour monitoring
          // They are only generated when N8N webhook calls /insights endpoint
          this.logger.log(`Test ${testId} completed via 24-hour monitoring - AI insights will be generated when N8N webhook processes the completion`);
        } else {
          this.logger.log(`Test ${testId} not ready for completion: ${completionResult.allVariationsComplete ? 'all variations complete but already finalized' : 'not all variations complete'}`);
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