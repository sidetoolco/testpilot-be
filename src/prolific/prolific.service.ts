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
        access_details: [
          {
            external_url: createTestDto.customScreeningEnabled
              ? `https://app.testpilotcpg.com/questions/${createTestDto.publicInternalName}`
              : `https://app.testpilotcpg.com/test/${createTestDto.publicInternalName}`,
            total_allocation: createTestDto.targetNumberOfParticipants,
          },
        ],
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
      };

      return await this.httpClient.post<ProlificStudy>('/studies', studyData);
    } catch (error) {
      this.logger.error('Failed to create Prolific study:', error);
      throw error;
    }
  }

  public async screenOutSubmission(studyId: string, submissionId: string) {
    try {
      await this.httpClient.post(
        `/studies/${studyId}/screen-out-submissions/`,
        {
          submission_ids: [submissionId],
          increase_places: true,
          bonus_per_submission: 0.14,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to screen out submission ${submissionId} for study ${studyId}: ${error}`,
      );
      throw error;
    }
  }

  public async markStudyAsActive(studyId: string) {
    const testId = await this.testsService.getTestIdByProlificStudyId(studyId);

    await this.testsService.updateTestStatus(testId, 'active');
  }

  public async publishStudy(studyId: string) {
    this.httpClient.post(`/studies/${studyId}/transition/`, {
      action: 'PUBLISH',
    });
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
    if (balance.available_balance > totalRequiredBalance) {
      const shortfall = totalRequiredBalance - balance.available_balance;
      throw new BadRequestException(
        `Insufficient balance. Required: ${(totalRequiredBalance / 100).toFixed(2)} ${balance.currency_code}, Available: ${(balance.available_balance / 100).toFixed(2)} ${balance.currency_code}, Shortfall: ${(shortfall / 100).toFixed(2)} ${balance.currency_code}`,
      );
    }

    this.logger.log(
      `Balance check passed. Total required: ${totalRequiredBalance} ${balance.currency_code}, Available: ${balance.available_balance} ${balance.currency_code}`,
    );
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
}
