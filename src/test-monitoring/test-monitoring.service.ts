import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProlificService } from 'prolific/prolific.service';
import { EmailService } from 'email/email.service';
import { TestsService } from 'tests/tests.service';
import { SupabaseService } from 'supabase/supabase.service';
import { TableName } from 'lib/enums';
import { Test, TestVariation } from 'lib/interfaces/entities.interface';

@Injectable()
export class TestMonitoringService {
  private readonly logger = new Logger(TestMonitoringService.name);

  constructor(
    private readonly prolificService: ProlificService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => TestsService))
    private readonly testsService: TestsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async scheduleTestCompletionCheck(
    studyId: string,
    testId: string,
    variationType: string,
  ) {
    // Queue-based scheduling removed to reduce Redis requests.
    this.logger.log(
      `Skipping queue scheduling for study ${studyId} (test ${testId}, variation ${variationType}); daily cron will handle checks.`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  public async dailyCompletionSweep() {
    this.logger.log('Starting daily test completion sweep');
    try {
      const activeTests = (await this.supabaseService.findMany(
        TableName.TESTS,
        { status: 'active' },
        'id',
      )) as unknown as Test[];

      if (!activeTests || activeTests.length === 0) {
        this.logger.log('No active tests found for completion sweep');
        return;
      }

      for (const test of activeTests) {
        try {
          const variations = (await this.testsService.getTestVariations(
            test.id,
          )) as unknown as TestVariation[];

          if (!variations || variations.length === 0) continue;

          let anyUpdated = false;
          let reminderStudyId: string | null = null;

          for (const variation of variations) {
            const studyId = (variation as any).prolific_test_id as string | null;
            const variationType = (variation as any).variation_type as string;
            if (!studyId) continue;

            try {
              const study = await this.prolificService.getStudy(studyId);
              if (!study) continue;

              if (study.status === 'COMPLETED') {
                await this.testsService.updateTestVariationStatus(
                  'complete',
                  test.id,
                  variationType,
                  studyId,
                );
                anyUpdated = true;
              } else {
                // Capture one study id for reminder email
                if (!reminderStudyId) reminderStudyId = studyId;
              }
            } catch (variationError) {
              this.logger.warn(
                `Failed to check study ${studyId} for test ${test.id}:`,
                variationError,
              );
            }
          }

          if (anyUpdated) {
            try {
              const result = await this.testsService.finalizeIfComplete(test.id);
              this.logger.log(
                `Finalize result for test ${test.id}: completed=${result.completed}, status=${result.testStatus}`,
              );
            } catch (finalizeError) {
              this.logger.error(
                `Failed to finalize completion for test ${test.id}:`,
                finalizeError,
              );
            }
          }

          if (reminderStudyId) {
            try {
              await this.emailService.sendTestCompletionReminder(
                reminderStudyId,
                test.id,
              );
            } catch (emailError) {
              this.logger.error(
                `Failed to send completion reminder for test ${test.id}:`,
                emailError,
              );
            }
          }
        } catch (testError) {
          this.logger.error(
            `Error processing completion sweep for test ${test.id}:`,
            testError,
          );
        }
      }
    } catch (error) {
      this.logger.error('Daily completion sweep failed:', error);
    } finally {
      this.logger.log('Daily test completion sweep finished');
    }
  }
}
