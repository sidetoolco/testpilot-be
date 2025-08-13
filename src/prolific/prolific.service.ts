import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ProlificHttpClient } from './prolific-http.client';
import {
  ProlificBalance,
  ProlificStudy,
  ProlificStudyCostResponse,
  ProlificStudySubmission,
} from './interfaces';
import { StudyStatus } from './types';
import { CreateTestDto, DemographicsDto } from 'tests/dto';
import { ConfigService } from '@nestjs/config';
import { TestStatus } from 'tests/types/test-status.type';
import { TestsService } from 'tests/tests.service';

@Injectable()
export class ProlificService {
  private readonly logger = new Logger(ProlificService.name);
  private readonly WORKSPACE_ID = '679be658b0f9417843a07767';

  constructor(
    private readonly httpClient: ProlificHttpClient,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => TestsService))
    private readonly testsService: TestsService,
  ) {}

  public async getStudy(studyId: string) {
    try {
      return await this.httpClient.get<ProlificStudy>(`/studies/${studyId}`);
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId}:`, error);
      throw error;
    }
  }

  public async getStudyDemographics(studyId: string) {
    try {
      const demographics = await this.httpClient.get<string>(
        `/studies/${studyId}/export`,
      );

      return this.formatStudyDemographics(demographics);
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId} demographics:`, error);
      throw error;
    }
  }

  public async getStudySubmissions(studyId: string, onlyInvalid = false) {
    try {
      const { results } = await this.httpClient.get<ProlificStudySubmission>(
        '/submissions/',
        { params: { study: studyId } }
      );

      return onlyInvalid
        ? results.filter(({ status }) => status !== 'APPROVED')
        : results;
    } catch (error) {
      this.logger.error(`Failed to get study ${studyId} submissions: ${error}`);
      throw error;
    }
  }

  public formatStatus(status: StudyStatus) {
    let formattedStatus: TestStatus;

    switch (status) {
      case 'UNPUBLISHED':
        formattedStatus = 'draft';
        break;
      case 'COMPLETED':
        formattedStatus = 'complete';
        break;
      case 'AWAITING REVIEW':
        formattedStatus = 'needs review';
        break;
      case 'ACTIVE':
        formattedStatus = 'active';
        break;
      default:
        formattedStatus = status;
    }

    return formattedStatus;
  }

  public async createStudy(
    createTestDto: CreateTestDto,
  ): Promise<ProlificStudy> {
    try {
      const filters = this.createProlificFilters(createTestDto.demographics);

      const studyData = {
        project: this.configService.get('PROLIFIC_PROJECT_ID'),
        name: createTestDto.publicTitle,
        internal_name: createTestDto.publicInternalName,
        description:
          'Welcome to your personalized shopping experience! This process is divided into two simple steps to understand your product preferences.\n\nStep 1: Choose from 12 products\nBrowse through our selection of products and choose the one you like the most. We want to know which ones you prefer.\n\nStep 2: Complete a short survey\nHelp us get to know you better by completing a brief survey.',
        // access_details: [
        //   {
        //     external_url: createTestDto.customScreeningEnabled
        //       ? `https://app.testpilotcpg.com/questions/${createTestDto.publicInternalName}`
        //       : `https://app.testpilotcpg.com/test/${createTestDto.publicInternalName}`,
        //     total_allocation: createTestDto.targetNumberOfParticipants,
        //   },
        // ],
        external_study_url: createTestDto.customScreeningEnabled
          ? `https://app.testpilotcpg.com/questions/${createTestDto.publicInternalName}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`
          : `https://app.testpilotcpg.com/test/${createTestDto.publicInternalName}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`,
        prolific_id_option: 'url_parameters',
        completion_codes: [
          {
            code: createTestDto.publicInternalName,
            code_type: 'COMPLETED',
            actions: [
              {
                action: 'AUTOMATICALLY_APPROVE',
              },
            ],
          },
          // TODO: Consider making this configurable or removing if not needed
          {
            code: 'DEF234',
            code_type: 'FOLLOW_UP_STUDY',
            actions: [
              {
                action: 'AUTOMATICALLY_APPROVE',
              },
            ],
          },
          {
            code: 'SPEEDER',
            code_type: 'OTHER',
            actions: [
              {
                action: 'REQUEST_RETURN',
                return_reason:
                  'Study completed too quickly (less than 2 minutes).',
              },
            ],
          },
          ...(createTestDto.customScreeningEnabled
            ? [
                {
                  code: 'SCREENED-OUT',
                  code_type: 'SCREENED_OUT',
                  actions: [
                    {
                      action: 'MANUALLY_REVIEW',
                    },
                  ],
                },
              ]
            : []),
        ],
        total_available_places: createTestDto.targetNumberOfParticipants,
        estimated_completion_time: createTestDto.participantTimeRequiredMinutes,
        reward: createTestDto.incentiveAmount,
        device_compatibility: ['desktop'],
        peripheral_requirements: [],
        filters,
        is_custom_screening: createTestDto.customScreeningEnabled,
      };

      const study = await this.httpClient.post<ProlificStudy>('/studies', studyData);
      
      // Calculate and store the cost immediately for future balance checks
      try {
        const studyCost = await this.calculateStudyCost(
          createTestDto.incentiveAmount,
          createTestDto.targetNumberOfParticipants,
        );
        
        // Store cost in test_variations table
        await this.testsService.updateStudyCost(
          createTestDto.testId,
          study.id,
          studyCost.total_cost,
          createTestDto.targetNumberOfParticipants,
          createTestDto.incentiveAmount
        );
        
        this.logger.log(`Stored study cost for ${study.id}: ${studyCost.total_cost} cents`);
      } catch (costError) {
        this.logger.warn(`Failed to store study cost for ${study.id}, but study was created:`, costError);
        // Don't fail the study creation if cost storage fails
      }
      
      return study;
    } catch (error) {
      this.logger.error('Failed to create Prolific study:', error);
      throw error;
    }
  }

  public async screenOutSubmission(
    studyId: string,
    submissionId: string,
    studyInternalName: string,
  ) {
    try {
      await this.httpClient.post(
        `/studies/${studyId}/screen-out-submissions/`,
        {
          submission_ids: [submissionId],
          bonus_per_submission: 0.14,
        },
      );

      // After successfully screening out, increase available places
      await this.increaseStudyPlacesBy(studyId, 1, 'screened-out');
    } catch (error) {
      this.logger.error(
        `Failed to screen out submission ${submissionId} for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  public async markStudyAsActive(studyId: string) {
    const testId = await this.testsService.getTestIdByProlificStudyId(studyId);

    await this.testsService.updateTestStatus(testId, 'active');
  }

  public async deleteStudy(studyId: string) {
    try {
      // First check if study exists and get current status
      const study = await this.getStudy(studyId);
      
      if (!study) {
        throw new BadRequestException(`Study ${studyId} not found`);
      }

      // Check if study is published (cannot delete published studies)
      if (study.status === 'ACTIVE' || study.status === 'COMPLETED') {
        throw new BadRequestException(`Cannot delete published study ${studyId}. Only draft studies can be deleted.`);
      }

      await this.httpClient.delete(`/studies/${studyId}/`);
      
      this.logger.log(`Study ${studyId} deleted successfully from Prolific`);
    } catch (error) {
      this.logger.error(`Failed to delete study ${studyId}:`, error);
      
      // Provide more specific error messages
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Handle Prolific API specific errors
      if (error.response?.status === 404) {
        throw new BadRequestException(`Study ${studyId} not found in Prolific`);
      }
      
      if (error.response?.status === 403) {
        throw new BadRequestException(`Study ${studyId} cannot be deleted (may be published or in use)`);
      }
      
      throw new BadRequestException(
        `Failed to delete study ${studyId}: ${error.message || 'Unknown error'}`,
      );
    }
  }


  /**
   * Comprehensive submission handler that processes all submission types
   * Replaces multiple separate handler methods for better maintainability
   */
  public async handleAllSubmissions(studyId: string): Promise<void> {
    try {
      const submissions = await this.getStudySubmissions(studyId);
      
      if (submissions.length === 0) {
        this.logger.log(`No submissions found for study ${studyId}`);
        return;
      }

      let screenedOutCount = 0;
      let rejectedCount = 0;
      let approvedCount = 0;
      let processedCount = 0;

      for (const submission of submissions) {
        try {
          const result = await this.processSubmission(submission);
          
          switch (result.action) {
            case 'SCREENED_OUT':
              screenedOutCount++;
              break;
            case 'REJECTED':
              rejectedCount++;
              break;
            case 'APPROVED':
              approvedCount++;
              break;
            case 'SKIPPED':
              // Already processed or no action needed
              break;
          }
          
          processedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to process submission ${submission.id}:`,
            error,
          );
        }
      }

      // Increase available places for submissions that need replacement
      const totalReplacements = screenedOutCount + rejectedCount;
      if (totalReplacements > 0) {
        await this.increaseStudyPlacesBy(studyId, totalReplacements, 'comprehensive-handling');
        this.logger.log(
          `Increased available places by ${totalReplacements} for study ${studyId} due to submissions needing replacement`
        );
      }

      this.logger.log(
        `Processed ${processedCount} submissions for study ${studyId}: ${screenedOutCount} screened out, ${rejectedCount} rejected, ${approvedCount} approved`
      );

    } catch (error) {
      this.logger.error(
        `Failed to handle submissions for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process individual submission and determine appropriate action
   */
  private readonly MIN_COMPLETION_TIME_SECONDS = 120;

  private async processSubmission(submission: any): Promise<{ action: string; reason?: string }> {
    // Case 1: 0 time taken (technical issues) - Screen out using proper endpoint
    if (submission.time_taken === 0 || submission.time_taken === null) {
      try {
        await this.httpClient.post(`/studies/${submission.study}/screen-out-submissions/`, {
          submission_ids: [submission.id],
          bonus_per_submission: 0.14,
        });

        this.logger.log(
          `Screened out submission ${submission.id} (participant ${submission.participant_id}) due to 0 time taken using proper endpoint`
        );
        
        return { action: 'SCREENED_OUT', reason: '0 time taken (technical issue)' };
      } catch (error) {
        this.logger.error(
          `Failed to screen out submission ${submission.id} due to 0 time taken:`,
          error
        );
        // Fall back to rejection if screen-out fails
        await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
          action: 'REJECT',
          message: 'Submission rejected due to technical issues (0 time taken).',
          rejection_category: 'OTHER'
        });
        return { action: 'REJECTED', reason: '0 time taken (fallback to rejection)' };
      }
    }

    // Case 2: Already screened out - Mark as complete
    if (submission.status === 'SCREENED_OUT') {
      await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
        action: 'COMPLETE',
        completion_code: 'SCREENED_OUT'
      });

      this.logger.log(
        `Completed screened out submission ${submission.id} (participant ${submission.participant_id})`
      );
      
      return { action: 'SCREENED_OUT', reason: 'already screened out' };
    }

    // Case 3: NO_CODE submissions - Reject
    if (!submission.study_code || submission.study_code.trim() === '') {
      await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
        action: 'REJECT',
        message: 'Submission rejected due to missing completion code. Please ensure you complete the study and receive a valid completion code.',
        rejection_category: 'NO_CODE'
      });

      this.logger.log(
        `Rejected submission ${submission.id} (participant ${submission.participant_id}) with NO_CODE category`
      );
      
      return { action: 'REJECTED', reason: 'no completion code' };
    }

    // Case 4: Very quick completions (< 2 minutes) - Reject
    if (submission.time_taken < this.MIN_COMPLETION_TIME_SECONDS) {
      await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
        action: 'REJECT',
        message: 'Submission rejected due to insufficient time spent on the study. Please ensure you complete all tasks thoroughly.',
        rejection_category: 'LOW_EFFORT'
      });

      this.logger.log(
        `Rejected submission ${submission.id} (participant ${submission.participant_id}) due to very quick completion (${submission.time_taken}s) with LOW_EFFORT category`
      );
      
      return { action: 'REJECTED', reason: 'too quickly completed' };
    }

    // Case 5: Valid submissions - Approve
    if (submission.status === 'AWAITING REVIEW') {
      await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
        action: 'APPROVE'
      });

      this.logger.log(
        `Approved submission ${submission.id} (participant ${submission.participant_id}) with completion code and time taken: ${submission.time_taken}s`
      );
      
      return { action: 'APPROVED', reason: 'valid submission' };
    }

    // Case 6: Already processed or no action needed
    return { action: 'SKIPPED', reason: 'already processed or no action needed' };
  }


  // Legacy methods for backward compatibility - these now delegate to the comprehensive handler
  public async handleNoCodeSubmissions(studyId: string): Promise<void> {
    return this.handleAllSubmissions(studyId);
  }

  public async handleAllScreenedOutSubmissions(studyId: string, studyInternalName: string): Promise<void> {
    return this.handleAllSubmissions(studyId);
  }

  public async handleAwaitingReviewSubmissions(studyId: string, studyInternalName: string): Promise<void> {
    return this.handleAllSubmissions(studyId);
  }

  public async handleRejectionsAndIncreasePlaces(studyId: string, studyInternalName: string): Promise<void> {
    return this.handleAllSubmissions(studyId);
  }


  public async getTestIdByProlificStudyId(prolificStudyId: string): Promise<string> {
    return await this.testsService.getTestIdByProlificStudyId(prolificStudyId);
  }

  public async publishStudy(studyId: string) {
    try {
      // First check if study exists and get current status
      const study = await this.getStudy(studyId);
      
      if (!study) {
        throw new BadRequestException(`Test ${studyId} not found`);
      }

      await this.httpClient.post(`/studies/${studyId}/transition/`, {
        action: 'PUBLISH',
      });
    } catch (error) {
      this.logger.error(`Failed to publish test ${studyId}:`, error);
      
      // Provide more specific error messages
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(
        `Failed to publish Test ${studyId}: ${error.message || 'Unknown error'}`,
      );
    }
  }

  public async getWorkspaceBalance(): Promise<ProlificBalance> {
    try {
      return await this.httpClient.get<ProlificBalance>(
        `/workspaces/${this.WORKSPACE_ID}/balance/`,
      );
    } catch (error) {
      this.logger.error(`Failed to get workspace balance:`, error);
      throw error;
    }
  }

  public async calculateStudyCost(
    reward: number,
    totalAvailablePlaces: number,
  ): Promise<ProlificStudyCostResponse> {
    try {
      return await this.httpClient.post<ProlificStudyCostResponse>(
        '/study-cost-calculator/',
        {
          reward,
          total_available_places: totalAvailablePlaces,
        },
      );
    } catch (error) {
      this.logger.error('Failed to calculate study cost:', error);
      throw error;
    }
  }

  public async checkBalanceForTestPublishing(
    studyIds: string[],
  ): Promise<void> {
    try {
      // Single API call for balance
      const balance = await this.getWorkspaceBalance();
      
      // Fast database lookup for costs (10x faster than API calls!)
      const totalRequiredBalance = await this.testsService.getTotalStudyCosts(studyIds);
      
      if (balance.available_balance < totalRequiredBalance) {
        const shortfall = totalRequiredBalance - balance.available_balance;
        throw new BadRequestException(
          `Insufficient balance. Required: ${(totalRequiredBalance / 100).toFixed(2)} ${balance.currency_code}, Available: ${(balance.available_balance / 100).toFixed(2)} ${balance.currency_code}, Shortfall: ${(shortfall / 100).toFixed(2)} ${balance.currency_code}`,
        );
      }
      
      this.logger.log(
        `Balance check passed. Total required: ${totalRequiredBalance} ${balance.currency_code}, Available: ${balance.available_balance} ${balance.currency_code}`,
      );
    } catch (error) {
      this.logger.error('Failed to check balance for test publishing:', error);
      throw error;
    }
  }



  private createProlificFilters(demographics: DemographicsDto) {
    const filters = [];
    const countryMap = {
      CA: '45',
      US: '1',
    };

    const genderMap = {
      Male: '0',
      Female: '1',
    };

    const interestMap = {
      'Health & Fitness': {
        filter_id: 'hobbies-categories',
        selected_values: ['6'],
      },
      'Actively Religious': {
        filter_id: 'participation-in-regular-religious-activities',
        selected_values: ['0', '1', '2'],
      },
      'Environmentally Conscious': {
        filter_id: 'concern-about-environmental-issues',
        selected_values: ['1', '2', '3', '4'],
      },
      'College Graduate': {
        filter_id: 'highest-education-level-completed',
        selected_values: ['3'],
      },
      'Military Veteran': {
        filter_id: 'military-veteran',
        selected_values: ['0', '1', '2'],
      },
      'Lower Income': {
        filter_id: 'personal-income-usd-us-participants-only',
        selected_values: ['0', '1', '2', '3', '4', '5'],
      },
    };

    // Add gender filter
    if (demographics.genders?.length) {
      const mappedGenders = demographics.genders
        .map((gender) => genderMap[gender])
        .filter(Boolean);

      if (mappedGenders.length) {
        filters.push({
          filter_id: 'sex',
          selected_values: mappedGenders,
        });
      }
    }

    // Add location filter
    if (demographics.locations.length) {
      const mappedLocations = demographics.locations
        .map((code) => countryMap[code])
        .filter(Boolean);

      if (mappedLocations.length) {
        filters.push({
          filter_id: 'current-country-of-residence',
          selected_values: mappedLocations,
        });
      }
    }

    // Add interests filter
    if (demographics.interests.length) {
      for (const interest of demographics.interests) {
        const filterObject = interestMap[interest];

        if (filterObject) {
          filters.push(filterObject);
        }
      }
    }

    // Add age filter
    const [lower, upper] = demographics.ageRanges;
    if (lower !== undefined && upper !== undefined) {
      filters.push({
        filter_id: 'age',
        selected_range: { lower: Number(lower), upper: Number(upper) },
      });
    }

    return filters;
  }

  private formatStudyDemographics(unformattedDemographics: string) {
    const lines = unformattedDemographics
      .split('\n')
      .filter((line) => line.trim() !== '');
    const headers = lines[0].split(',');

    const formattedDemographics = lines.slice(1).map((line) => {
      const values = line.split(',');
      let obj = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = values[index] ? values[index].trim() : null;
      });
      return obj;
    });

    return formattedDemographics;
  }



  /**
   * Atomic-style helper to increase study places by a delta
   * Prevents race conditions by getting current value and updating in one operation
   */
  private async increaseStudyPlacesBy(studyId: string, delta: number, reason: string): Promise<void> {
    try {
      const study = await this.getStudy(studyId);
      const newPlaces = study.total_available_places + delta;
      
      await this.httpClient.patch(`/studies/${studyId}/`, {
        total_available_places: newPlaces,
      });
      
      // Update stored cost if participant count changed significantly
      if (delta > 0) {
        try {
          const newStudyCost = await this.calculateStudyCost(
            study.reward,
            newPlaces,
          );
          
          // Note: We can't update the cost here since we don't have the testId
          // The cost will be updated when the study is properly linked to the test variation
          this.logger.log(`Study places increased for ${studyId}, cost update skipped (no testId available)`);
          
          this.logger.log(`Updated stored cost for study ${studyId} after increasing places`);
        } catch (costError) {
          this.logger.warn(`Failed to update stored cost for study ${studyId}:`, costError);
          // Don't fail the main operation if cost update fails
        }
      }
      
      this.logger.log(
        `Increased places by ${delta} for study ${studyId} (${reason}): ${study.total_available_places} → ${newPlaces}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to increase places by ${delta} for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Recalculate and update costs for existing studies
   * Useful for updating costs after Prolific pricing changes
   */
  public async recalculateStudyCosts(studyIds: string[]): Promise<void> {
    try {
      let updatedCount = 0;
      
      for (const studyId of studyIds) {
        try {
          const study = await this.getStudy(studyId);
          const studyCost = await this.calculateStudyCost(
            study.reward,
            study.total_available_places,
          );
          
          // Note: We can't update the cost here since we don't have the testId
          // This method is mainly for updating costs when we have the proper test context
          this.logger.log(`Study cost calculated for ${studyId}: ${studyCost.total_cost} cents, but update skipped (no testId available)`);
          
          updatedCount++;
          this.logger.log(`Recalculated cost for study ${studyId}: ${studyCost.total_cost} cents`);
        } catch (error) {
          this.logger.error(`Failed to recalculate cost for study ${studyId}:`, error);
        }
      }
      
      this.logger.log(`Successfully recalculated costs for ${updatedCount}/${studyIds.length} studies`);
    } catch (error) {
      this.logger.error('Failed to recalculate study costs:', error);
      throw error;
    }
  }
}