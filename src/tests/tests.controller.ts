import {
  Body,
  Controller,
  forwardRef,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { CreateTestDto } from './dto';
import { ProlificService } from 'prolific/prolific.service';
import { TestMonitoringService } from 'test-monitoring/test-monitoring.service';

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    @Inject(forwardRef(() => ProlificService))
    private readonly prolificService: ProlificService,
    private readonly testMonitoringService: TestMonitoringService,
  ) {}

  @Get('/:id')
  getTestData(@Param('id') testId: string) {
    return this.testsService.getRawDataByTestId(testId);
  }

  @Post()
  async createTest(@Body() dto: CreateTestDto) {
    // Create the study in Prolific
    const prolificStudy = await this.prolificService.createStudy(dto);

    // Update the test variation in Supabase
    await this.testsService.updateTestVariationStatus(
      'draft',
      dto.testId,
      dto.variationType,
      prolificStudy.id,
    );

    // Schedule the completion check
    await this.testMonitoringService.scheduleTestCompletionCheck(
      prolificStudy.id,
      dto.testId,
    );

    // Return the completion URL
    return {
      url: `https://app.prolific.com/submissions/complete?cc=${prolificStudy.completion_codes[0].code}`,
    };
  }

  @Post('/:testId/publish')
  async publishTest(@Param('testId') testId: string) {
    await this.testsService.publishTest(testId);

    return HttpStatus.OK;
  }
}
