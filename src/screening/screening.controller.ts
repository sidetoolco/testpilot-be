import { Body, Controller, Post } from '@nestjs/common';
import { ScreeningService } from './screening.service';

@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post('validate-question')
  async validateScreeningQuestion(@Body('question') question: string = '') {
    return this.screeningService.validateScreeningQuestion(question);
  }
}
