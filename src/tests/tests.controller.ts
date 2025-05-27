import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from 'auth/guards/auth.guard';
import { CreateTestDto } from './dto';
import { ProlificService } from 'prolific/prolific.service';

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly prolificService: ProlificService,
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

    // Return the completion URL
    return {
      url: `https://app.prolific.com/submissions/complete?cc=${prolificStudy.completion_codes[0].code}`,
    };
  }
}
