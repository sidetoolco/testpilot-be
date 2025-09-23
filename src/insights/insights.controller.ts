import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard, AdminGuard } from 'auth/guards';
import { UpdateInsightDto } from './dto';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Post()
  generateStudyInsights(@Body('studyId') studyId: string) {
    if (!studyId) {
      throw new BadRequestException('Study ID is required');
    }
    return this.insightsService.generateStudyInsights(studyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:testId/generate-summary')
  generateSummaryForTest(@Param('testId') testId: string) {
    return this.insightsService.generateSummaryForTest(testId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:testId')
  generateAiInsights(@Param('testId') testId: string) {
    return this.insightsService.saveAiInsights(testId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('/:insightId')
  updateInsight(
    @Param('insightId', ParseIntPipe) insightId: number,
    @Body() updateData: UpdateInsightDto,
  ) {
    return this.insightsService.updateInsightById(insightId, updateData);
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
