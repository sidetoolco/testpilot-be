import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Logger,
  Post,
  Delete,
  Param,
} from '@nestjs/common';
import { ProlificService } from './prolific.service';
import { ScreenOutSubmissionDto } from './dto';
import { StudyStatus } from './types';

@Controller('prolific')
export class ProlificController {
  private readonly logger = new Logger(ProlificController.name);

  constructor(private readonly prolificService: ProlificService) {}

  @Post('/submission/screen-out')
  async screenOutSubmission(
    @Body()
    { studyId, participantId, studyInternalName }: ScreenOutSubmissionDto,
  ) {
    this.logger.log(
      `Screening out participant's ${participantId} submission for study ${studyId}`,
    );

    const submissions = await this.prolificService.getStudySubmissions(studyId);
    const submission = submissions.find(
      (s) => s.participant_id === participantId,
    );

    if (!submission) {
      throw new BadRequestException(
        `Found no submission from participant with ID ${participantId}`,
      );
    }

    await this.prolificService.screenOutSubmission(
      studyId,
      submission.id,
      studyInternalName,
    );

    this.logger.log(`Participant ${participantId} screened out successfully`);
    return HttpStatus.OK;
  }

  @Post('/study/status')
  async changeStudyStatus(
    @Body('status') status: StudyStatus,
    @Body('resource_id') studyId: string,
  ) {
    if (status === 'ACTIVE') {
      await this.prolificService.markStudyAsActive(studyId);
    }

    return HttpStatus.OK;
  }

  @Delete('/study/:id')
  async deleteStudy(@Param('id') studyId: string) {
    this.logger.log(`Deleting study ${studyId}`);

    // Extract the base study ID and variant from the full study ID
    const { baseStudyId, variant } = this.extractStudyInfo(studyId);
    
    if (!baseStudyId) {
      throw new BadRequestException('Invalid study ID format');
    }

    // Get the test ID from the Prolific study ID
    const testId = await this.prolificService.getTestIdByProlificStudyId(baseStudyId);

    // Delete all variants of the test
    await this.prolificService.deleteAllTestVariants(testId);

    this.logger.log(`All variants of study ${studyId} deleted successfully`);
    return HttpStatus.OK;
  }

  private extractStudyInfo(studyId: string): { baseStudyId: string | null; variant: string | null } {
    // Pattern: {baseTestId}-{variantType}
    // Example: f5de3b42-5a65-41ca-828b-d2182457dac2-a
    const match = studyId.match(/^(.+)-([abc])$/);
    
    if (match) {
      return {
        baseStudyId: match[1],
        variant: match[2]
      };
    }
    
    // If no variant suffix, treat as base study ID
    return {
      baseStudyId: studyId,
      variant: null
    };
  }
}
