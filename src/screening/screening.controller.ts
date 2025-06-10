import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post('validate-question')
  async validateScreeningQuestion(@Body('question') question: string = '') {
    return this.screeningService.validateScreeningQuestion(question);
  }
}
