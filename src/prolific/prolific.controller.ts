import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ProlificService } from './prolific.service';
import { ScreenOutSubmissionDto } from './dto';

@Controller('prolific')
export class ProlificController {
  constructor(private readonly prolificService: ProlificService) {}

  @Post('/submission/screen-out')
  async screenOutSubmission(
    @Body() { studyId, participantId }: ScreenOutSubmissionDto,
  ) {
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

    return HttpStatus.OK;
  }
}
