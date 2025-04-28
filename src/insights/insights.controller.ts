import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { GenerateStudyInsightsDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('/:testId')
  getInsightsDataFromTest(@Param('testId') testId: string) {
    return this.insightsService.getInsightsData(testId);
  }

  @Post()
  generateStudyInsights(@Body() dto: GenerateStudyInsightsDto) {
    return this.insightsService.generateStudyInsights(dto.studyId);
  }

  @Post('/:testId')
  generateAiInsights(@Param('testId') testId: string) {
    return this.insightsService.saveAiInsights(testId);
  }
}
