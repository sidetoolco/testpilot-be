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
      const url = new URL('/submissions/', this.httpClient['baseUrl']);
      url.searchParams.append('study', studyId);

      const { results } = await this.httpClient.get<ProlificStudySubmission>(
        url.pathname + url.search,
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
        submissions_config: {
          // Prevent automatic approval of submissions without proper completion codes
          // This ensures that submissions with >2 minutes but no proper code get flagged for review
          auto_rejection_categories: [
            'NO_CODE',
            'BAD_CODE', 
            'NO_DATA',
            'FAILED_INSTRUCTIONS',
            'FAILED_CHECK',
            'LOW_EFFORT',
            'MALINGERING'
          ]
        },
      };

      return await this.httpClient.post<ProlificStudy>('/studies', studyData);
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
      await this.increaseStudyAvailablePlaces(studyId, studyInternalName);
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


  public async handleRejectionsAndIncreasePlaces(
    studyId: string,
    studyInternalName: string,
  ): Promise<void> {
    try {
      // Get all submissions for the study
      const submissions = await this.getStudySubmissions(studyId);
      
      // Use shared helper for consistent replacement logic
      const submissionsToReplace = submissions.filter(submission => 
        this.needsReplacement(submission)
      );

      if (submissionsToReplace.length === 0) {
        this.logger.log(`No submissions that need replacement found for study ${studyId}`);
        return;
      }

      // Use atomic helper to increase places by the total count needed
      await this.increaseStudyPlacesBy(studyId, submissionsToReplace.length, 'replacements-needed');

      // Log details of what was processed
      submissionsToReplace.forEach(submission => {
        let reason = '';
        
        if (submission.time_taken === 0 || submission.time_taken === null) {
          reason = '0 time taken (technical issue)';
        } else if (submission.status === 'SCREENED_OUT') {
          reason = `screened out (needs replacement)`;
        } else if (!submission.study_code || submission.study_code.trim() === '') {
          reason = 'no completion code (NO_CODE)';
        }
        
        this.logger.log(
          `Submission ${submission.id} (participant ${submission.participant_id}) - ${reason} - increased available places by 1`
        );
      });

    } catch (error) {
      this.logger.error(
        `Failed to handle rejections and increase places for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }


  public async handleNoCodeSubmissions(studyId: string): Promise<void> {
    try {
      const submissions = await this.getStudySubmissions(studyId);
      
      // Only target submissions that actually lack a completion code
      // Don't include AWAITING_REVIEW status as it could have valid codes
      const noCodeSubmissions = submissions.filter(submission => 
        !submission.study_code || 
        submission.study_code.trim() === ''
      );

      if (noCodeSubmissions.length === 0) {
        this.logger.log(`No NO_CODE submissions found for study ${studyId}`);
        return;
      }

      // Reject each NO_CODE submission using the Prolific API
      for (const submission of noCodeSubmissions) {
        try {
          await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
            action: 'REJECT',
            message: 'Submission rejected due to missing completion code. Please ensure you complete the study and receive a valid completion code.',
            rejection_category: 'NO_CODE'
          });

          this.logger.log(
            `Rejected submission ${submission.id} (participant ${submission.participant_id}) with NO_CODE category`
          );
        } catch (error) {
          this.logger.error(
            `Failed to reject submission ${submission.id}:`,
            error
          );
        }
      }

      // After rejecting NO_CODE submissions, increase available places
      const count = noCodeSubmissions.length;
      if (count > 0) {
        await this.increaseStudyPlacesBy(studyId, count, 'no-code-handled');
      }

    } catch (error) {
      this.logger.error(
        `Failed to handle NO_CODE submissions for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  public async handleAllScreenedOutSubmissions(studyId: string, studyInternalName: string): Promise<void> {
    try {
      const submissions = await this.getStudySubmissions(studyId);
      
      // Get all submissions that are already screened out (regardless of time taken)
      const screenedOutSubmissions = submissions.filter(submission => 
        submission.status === 'SCREENED_OUT'
      );

      if (screenedOutSubmissions.length === 0) {
        this.logger.log(`No screened out submissions found for study ${studyId}`);
        return;
      }

      // Transition each screened out submission to SCREENED_OUT status using the Prolific API
      for (const submission of screenedOutSubmissions) {
        try {
          await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
            action: 'COMPLETE',
            completion_code: 'SCREENED_OUT'
          });

          this.logger.log(
            `Transitioned submission ${submission.id} (participant ${submission.participant_id}) to SCREENED_OUT status (time taken: ${submission.time_taken || 0}s)`
          );
        } catch (error) {
          this.logger.error(
            `Failed to transition submission ${submission.id} to SCREENED_OUT:`,
            error
          );
        }
      }

      // Increase available places for all screened out submissions since they need replacement
      await this.increaseStudyPlacesBy(studyId, screenedOutSubmissions.length, 'screened-out-replacements');

      this.logger.log(
        `Increased available places by ${screenedOutSubmissions.length} for study ${studyId} due to screened out submissions`
      );

    } catch (error) {
      this.logger.error(
        `Failed to handle screened out submissions for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  public async handleAwaitingReviewSubmissions(studyId: string, studyInternalName: string): Promise<void> {
    try {
      const submissions = await this.getStudySubmissions(studyId);
      
      // Get all submissions that are awaiting review
      const awaitingReviewSubmissions = submissions.filter(submission => 
        submission.status === 'AWAITING REVIEW'
      );

      if (awaitingReviewSubmissions.length === 0) {
        this.logger.log(`No AWAITING REVIEW submissions found for study ${studyId}`);
        return;
      }

      let rejectedCount = 0;
      let screenedOutCount = 0;

      // Process each awaiting review submission
      for (const submission of awaitingReviewSubmissions) {
        try {
          if (!submission.study_code || submission.study_code.trim() === '') {
            // No completion code - reject
            await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
              action: 'REJECT',
              message: 'Submission rejected due to missing completion code. Please ensure you complete the study and receive a valid completion code.',
              rejection_category: 'NO_CODE'
            });

            this.logger.log(
              `Rejected submission ${submission.id} (participant ${submission.participant_id}) with NO_CODE category`
            );
            rejectedCount++;
          } else if (submission.time_taken === 0 || submission.time_taken === null) {
            // 0 time taken - screen out (no payment, needs replacement)
            await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
              action: 'COMPLETE',
              completion_code: 'SCREENED_OUT'
            });

            this.logger.log(
              `Screened out submission ${submission.id} (participant ${submission.participant_id}) due to 0 time taken`
            );
            screenedOutCount++;
          } else if (submission.time_taken < 120) {
            // Very quick submission (less than 1 minute) - likely low effort
            await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
              action: 'REJECT',
              message: 'Submission rejected due to insufficient time spent on the study. Please ensure you complete all tasks thoroughly.',
              rejection_category: 'LOW_EFFORT'
            });

            this.logger.log(
              `Rejected submission ${submission.id} (participant ${submission.participant_id}) due to very quick completion (${submission.time_taken}s) with LOW_EFFORT category`
            );
            rejectedCount++;
          } else {
            // Has completion code and reasonable time taken - approve
            await this.httpClient.post(`/submissions/${submission.id}/transition/`, {
              action: 'APPROVE'
            });

            this.logger.log(
              `Approved submission ${submission.id} (participant ${submission.participant_id}) with completion code and time taken: ${submission.time_taken}s`
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to transition submission ${submission.id}:`,
            error
          );
        }
      }

      // Increase available places for screened out submissions since they need replacement
      if (screenedOutCount > 0) {
        await this.increaseStudyPlacesBy(studyId, screenedOutCount, 'screened-out-from-awaiting-review');
        this.logger.log(
          `Increased available places by ${screenedOutCount} for study ${studyId} due to screened out submissions from awaiting review`
        );
      }

      // Increase available places for rejected submissions since they need replacement
      if (rejectedCount > 0) {
        await this.increaseStudyPlacesBy(studyId, rejectedCount, 'rejected-from-awaiting-review');
        this.logger.log(
          `Increased available places by ${rejectedCount} for study ${studyId} due to rejected submissions from awaiting review`
        );
      }

      this.logger.log(
        `Processed ${awaitingReviewSubmissions.length} AWAITING REVIEW submissions: ${screenedOutCount} screened out, ${rejectedCount} rejected, ${awaitingReviewSubmissions.length - screenedOutCount - rejectedCount} approved`
      );

    } catch (error) {
      this.logger.error(
        `Failed to handle awaiting review submissions for study ${studyId}:`,
        error,
      );
      throw error;
    }
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
    // Get workspace balance
    const balance = await this.getWorkspaceBalance();

    let totalRequiredBalance = 0;

    // Calculate total cost for all variations
    for (const studyId of studyIds) {
      try {
        const study = await this.getStudy(studyId);
        const studyCost = await this.calculateStudyCost(
          study.reward,
          study.total_available_places,
        );

        totalRequiredBalance += studyCost.total_cost;
      } catch (error) {
        this.logger.error(
          `Failed to calculate cost for study ${studyId}:`,
          error,
        );

        throw new BadRequestException(
          `Failed to calculate cost for study ${studyId}`,
        );
      }
    }

    // Check if we have enough balance
    if (balance.available_balance < totalRequiredBalance) {
      const shortfall = totalRequiredBalance - balance.available_balance;
      throw new BadRequestException(
        `Insufficient balance. Required: ${(totalRequiredBalance / 100).toFixed(2)} ${balance.currency_code}, Available: ${(balance.available_balance / 100).toFixed(2)} ${balance.currency_code}, Shortfall: ${(shortfall / 100).toFixed(2)} ${balance.currency_code}`,
      );
    }

    this.logger.log(
      `Balance check passed. Total required: ${totalRequiredBalance} ${balance.currency_code}, Available: ${balance.available_balance} ${balance.currency_code}`,
    );
  }

  public async increaseStudyAvailablePlaces(
    studyId: string,
    studyInternalName: string,
  ): Promise<void> {
    try {
      // First, get the current study to find the current total_available_places
      const currentStudy = await this.getStudy(studyId);
      const currentPlaces = currentStudy.total_available_places;

      const newPlaces = currentPlaces + 1;

      // Update the study with the new total_available_places
      await this.httpClient.patch(`/studies/${studyId}`, {
        total_available_places: newPlaces,
        // external_study_url: `https://app.testpilotcpg.com/questions/${studyInternalName}?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`,
        // access_details: [
        //   {
        //     external_url:
        //       `https://app.testpilotcpg.com/questions/${studyInternalName}`,
        //     total_allocation: 1,
        //   },
        // ],
      });

      this.logger.log(
        `Increased available places for study ${studyId} from ${currentPlaces} to ${newPlaces}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to increase available places for study ${studyId}:`,
        error,
      );

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
   * Helper method to determine if a submission needs replacement
   * Ensures consistent logic across all methods
   */
  private needsReplacement(submission: any): boolean {
    // Case 1: 0 time taken (technical issues)
    if (submission.time_taken === 0 || submission.time_taken === null) {
      return true;
    }
    
    // Case 2: Screened out users (all screened out users must be replaced)
    if (submission.status === 'SCREENED_OUT') {
      return true;
    }
    
    // Case 3: NO_CODE submissions (no completion code)
    if (!submission.study_code || submission.study_code.trim() === '') {
      return true;
    }
    
    return false;
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
}