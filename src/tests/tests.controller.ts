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
import { SubmitTestResponseDto } from './dto/test-response.dto';
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

  @Post('/:id/check-completion')
  async checkTestCompletion(@Param('id') testId: string) {
    try {
      // Check if all variations are complete
      const allComplete = await this.testsService.areAllVariationsComplete(testId);
      
      if (allComplete) {
        // Update test status to complete
        await this.testsService.updateTestStatus(testId, 'complete');
        return { 
          message: 'Test status updated to complete', 
          testId, 
          allVariationsComplete: true 
        };
      } else {
        return { 
          message: 'Not all variations are complete yet', 
          testId, 
          allVariationsComplete: false 
        };
      }
    } catch (error) {
      this.logger.error(`Error checking test completion for ${testId}:`, error);
      throw error;
    }
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

  @Post('/response')
  async submitTestResponse(@Body() responseData: SubmitTestResponseDto) {
    try {
      this.logger.log('Received test response submission', {
        testId: responseData.session.test_id,
        prolificPid: responseData.session.prolific_pid,
        timingCount: responseData.timing_data?.length || 0,
        responseCount: responseData.responses?.length || 0,
        hasWalmartProductId: !!responseData.session.walmart_product_id,
        timingDataSample: responseData.timing_data?.[0],
      });

      // Validate required fields
      if (!responseData.session.test_id) {
        throw new BadRequestException('Missing test_id in session');
      }
      if (!responseData.session.prolific_pid) {
        throw new BadRequestException('Missing prolific_pid in session');
      }

      const result = await this.testsService.submitTestResponse(responseData);
      
      this.logger.log('Test response submitted successfully', result);
      return result;
    } catch (error) {
      this.logger.error('Error submitting test response:', error);
      throw new BadRequestException(`Failed to submit test response: ${error.message}`);
    }
  }

  @Post('/webhook/prolific')
  async handleProlificWebhook(@Body() webhookData: any) {
    try {
      this.logger.log('Received Prolific webhook', {
        type: webhookData.type,
        studyId: webhookData.study_id,
        participantId: webhookData.participant_id,
      });

      // Handle different webhook types
      switch (webhookData.type) {
        case 'SUBMISSION_CREATED':
          // Process submission data
          if (webhookData.data) {
            const result = await this.testsService.submitTestResponse(webhookData.data);
            return { success: true, result };
          }
          break;
        default:
          this.logger.log(`Unhandled webhook type: ${webhookData.type}`);
      }

      return { success: true, message: 'Webhook processed' };
    } catch (error) {
      this.logger.error('Error processing Prolific webhook:', error);
      throw new BadRequestException(`Failed to process webhook: ${error.message}`);
    }
  }
}
