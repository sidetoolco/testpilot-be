import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProlificService } from 'prolific/prolific.service';

@Processor('test-completion')
export class TestMonitoringProcessor extends WorkerHost {
  private readonly logger = new Logger(TestMonitoringProcessor.name);

  constructor(private readonly prolificService: ProlificService) {
    super();
  }

  async process(
    job: Job<{ studyId: string; testId: string; variationType: string }>,
  ) {
    const { studyId, testId } = job.data;

    try {
      // Get study from Prolific
      const study = await this.prolificService.getStudy(studyId);

      if (!study) {
        throw new Error(`Study ${studyId} not found`);
      }

      const isCompleted = study.status === 'COMPLETED';
    } catch (error) {
      this.logger.error(
        `Failed to process completion check for study ${studyId}: `,
        error,
      );
    }
  }
}
