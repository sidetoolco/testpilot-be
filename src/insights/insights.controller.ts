import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard, AdminGuard } from 'auth/guards';
import { GenerateStudyInsightsDto, UpdateInsightDto } from './dto';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post()
  generateStudyInsights(@Body() dto: GenerateStudyInsightsDto) {
    return this.insightsService.generateStudyInsights(dto.studyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:testId')
  generateAiInsights(@Param('testId') testId: string) {
    return this.insightsService.saveAiInsights(testId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('/:insightId')
  updateInsight(
    @Param('insightId') insightId: string,
    @Body() updateData: UpdateInsightDto,
  ) {
    return this.insightsService.updateInsightById(Number(insightId), updateData);
  }

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
}
