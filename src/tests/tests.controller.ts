import {
  Body,
  Controller,
  forwardRef,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Delete,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard, AdminGuard } from 'auth/guards';
import { CreateTestDto, UpdateTestBlockDto } from './dto';
import { ProlificService } from 'prolific/prolific.service';

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  private readonly logger = new Logger(TestsController.name);

  constructor(
    private readonly testsService: TestsService,
    @Inject(forwardRef(() => ProlificService))
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

  @Post('/:testId/publish')
  async publishTest(@Param('testId') testId: string) {
    await this.testsService.publishTest(testId);

    return HttpStatus.OK;
  }

  @Post('/block')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateTestBlockStatus(@Body() dto: UpdateTestBlockDto) {
    await this.testsService.updateTestBlockStatus(dto.testId, dto.block);

    return {
      message: `Test block status updated successfully`,
      testId: dto.testId,
      block: dto.block,
      note: 'Block status can only be updated for tests with complete status. Block can be set to true or false.',
    };
  }

  @Delete('/:testId')
  @UseGuards(JwtAuthGuard)
  async deleteTest(@Param('testId') testId: string) {
    try {
      // 1. Validate test exists and user has permission
      const test = await this.testsService.getTestById(testId);
      if (!test) {
        throw new BadRequestException('Test not found');
      }
      
      // 2. Delete all Prolific studies and Supabase data for this test
      await this.testsService.deleteTest(testId);
      
      return { statusCode: 200, message: 'OK' };
      
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to delete test: ${error.message}`);
    }
  }
}
