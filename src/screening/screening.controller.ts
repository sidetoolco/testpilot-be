import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { ValidateQuestionDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post('validate-question')
  async validateScreeningQuestion(
    @Body() { question, desiredAnswer }: ValidateQuestionDto,
  ) {
    return this.screeningService.validateScreeningQuestion(
      question,
      desiredAnswer,
    );
  }
}
