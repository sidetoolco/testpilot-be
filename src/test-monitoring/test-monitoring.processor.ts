import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from 'email/email.service';
import { ProlificService } from 'prolific/prolific.service';
import { TestsService } from 'tests/tests.service';

@Processor('test-completion')
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
        this.logger.log(`Study ${studyId} is completed, updating test status for test ${testId}`);
        
        // Update test status to complete
        await this.testsService.updateTestStatus(testId, 'complete');
        
        // Update the specific variation status to complete
        await this.testsService.updateTestVariationStatus('complete', testId, variationType, studyId);
        
        // Remove job from queue since it's completed
        await job.remove();
        
        this.logger.log(`Successfully updated test ${testId} and variation status to complete`);
      } else {
        this.logger.log(`Study ${studyId} is not yet completed (status: ${study.status}), sending reminder`);
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
