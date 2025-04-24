import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('/:testId')
  getInsightsFromTest(@Param('testId') testId: string) {
    return this.insightsService.getInsights(testId);
  }
}
