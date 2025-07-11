import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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
    private readonly testsService: TestsService,
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
      } else {
        // Check if all studies for this test have reached their target sample
        await this.checkTestCompletion(testId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process completion check for study ${studyId}: `,
        error,
      );
    }
  }

  private async checkTestCompletion(testId: string) {
    try {
      // Get all variations for this test
      const testVariations = await this.testsService.getTestVariations(testId);
      
      if (!testVariations || testVariations.length === 0) {
        this.logger.warn(`No variations found for test ${testId}`);
        return;
      }

      let allStudiesCompleted = true;
      let totalCompletedSubmissions = 0;
      let totalTargetSubmissions = 0;

      // Check each study's completion status
      for (const variation of testVariations) {
        if (!variation.prolific_test_id) {
          this.logger.warn(`Variation ${variation.variation_type} has no prolific_test_id`);
          allStudiesCompleted = false;
          continue;
        }

        try {
          const study = await this.prolificService.getStudy(variation.prolific_test_id);
          const submissions = await this.prolificService.getStudySubmissions(variation.prolific_test_id);
          
          // Count approved submissions (completed participants)
          const approvedSubmissions = submissions.filter(sub => sub.status === 'APPROVED');
          const completedCount = approvedSubmissions.length;
          const targetCount = study.total_available_places;

          totalCompletedSubmissions += completedCount;
          totalTargetSubmissions += targetCount;

          this.logger.log(
            `Study ${variation.prolific_test_id} (${variation.variation_type}): ${completedCount}/${targetCount} completed`
          );

          // Check if this study has reached its target
          if (completedCount < targetCount) {
            allStudiesCompleted = false;
          }
        } catch (error) {
          this.logger.error(
            `Failed to check completion for study ${variation.prolific_test_id}:`,
            error
          );
          allStudiesCompleted = false;
        }
      }

      // If all studies have reached their target, mark test as complete
      if (allStudiesCompleted && totalTargetSubmissions > 0) {
        this.logger.log(
          `All studies for test ${testId} have reached their targets. Marking as complete. Total: ${totalCompletedSubmissions}/${totalTargetSubmissions}`
        );
        await this.testsService.updateTestStatus(testId, 'complete');
      } else {
        this.logger.log(
          `Test ${testId} not ready for completion. Total completed: ${totalCompletedSubmissions}/${totalTargetSubmissions}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to check test completion for ${testId}:`, error);
    }
  }
}
