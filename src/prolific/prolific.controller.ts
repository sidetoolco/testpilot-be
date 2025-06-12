import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Logger,
  Post,
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
    @Body() { studyId, participantId }: ScreenOutSubmissionDto,
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

    await this.prolificService.screenOutSubmission(studyId, submission.id);

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
}
