import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { GenerateStudyInsightsDto } from './dto';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('/:testId') 
  getInsightsDataFromTest(
    @Param('testId') testId: string,
    @Query('type') insightsType?: string
  ) {
    return insightsType === 'ai' 
      ? this.insightsService.getAiInsights(testId) 
      : this.insightsService.getInsightsData(testId);
  }

  @Post()
  generateStudyInsights(@Body() dto: GenerateStudyInsightsDto) {
    return this.insightsService.generateStudyInsights(dto.studyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:testId')
  generateAiInsights(@Param('testId') testId: string) {
    return this.insightsService.saveAiInsights(testId);
  }
}
