import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from 'supabase/supabase.service';
import {
  Product,
  ProductWithProlificStatus,
  RawTestData,
  TestData,
  CompetitiveInsights,
} from './interfaces';
import { Rpc, TableName } from 'lib/enums';
import { GET_TEST_DATA_QUERY } from './constants';
import {
  Test,
  TestDemographics,
  TestSummary,
  TestTime,
  TestVariation,
} from 'lib/interfaces/entities.interface';
import { TestStatus } from './types/test-status.type';
import { ProlificService } from 'prolific/prolific.service';
import { TestStatusGateway } from './gateways/test-status.gateway';
import { TestMonitoringService } from 'test-monitoring/test-monitoring.service';
import { CreditsService } from 'credits/credits.service';

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prolificService: ProlificService,
    private readonly testStatusGateway: TestStatusGateway,
    private readonly testMonitoringService: TestMonitoringService,
    private readonly creditsService: CreditsService,
  ) {}

  public async getTestById(testId: string): Promise<Test> {
    const test = await this.supabaseService.getById<Test>({
      tableName: TableName.TESTS,
      id: testId,
      single: true,
    });

    if (!test) throw new NotFoundException('Test not found');

    return test;
  }

  public async getRawDataByTestId(testId: string): Promise<TestData> {
    const unformattedTestData = await this.supabaseService.getById<RawTestData>(
      {
        tableName: TableName.TESTS,
        id: testId,
        selectQuery: GET_TEST_DATA_QUERY,
      },
    );

    if (!unformattedTestData) throw new NotFoundException('Test not found');

    return this.transformTestData(unformattedTestData);
  }

  public getTestDemographics(testId: string) {
    return this.supabaseService.getByCondition<TestDemographics>({
      tableName: TableName.TEST_DEMOGRAPHICS,
      selectQuery: '*',
      condition: 'test_id',
      value: testId,
    });
  }

  public getTestSummaries(testId: string) {
    return this.supabaseService.getByCondition<TestSummary[]>({
      tableName: TableName.TEST_SUMMARY,
      selectQuery: '*',
      condition: 'test_id',
      value: testId,
      single: false,
    });
  }

  public getCompetitorInsights(testId: string): Promise<CompetitiveInsights> {
    return this.supabaseService.rpc(Rpc.GET_COMPETITOR_INSIGHTS, {
      p_test_id: testId,
    });
  }

  public async updateTestVariationStatus(
    status: string,
    testId: string,
    variation: string,
    prolificTestId?: string,
  ) {
    const updatePayload: Record<string, string> = {
      prolific_status: status,
    };

    if (prolificTestId) {
      updatePayload.prolific_test_id = prolificTestId;
    }

    return await this.supabaseService.update<TestVariation>(
      TableName.TEST_VARIATIONS,
      updatePayload,
      [
        { key: 'test_id', value: testId },
        { key: 'variation_type', value: variation },
      ],
    );
  }

  public getTestVariations(testId: string) {
    return this.supabaseService.getByCondition<TestVariation[]>({
      tableName: TableName.TEST_VARIATIONS,
      selectQuery: '*, product:products(*)',
      condition: 'test_id',
      value: testId,
      single: false,
    });
  }

  public getTestTimesByTestVariation(testId: string, variationType: string) {
    return this.supabaseService.getByCondition<TestTime[]>({
      tableName: TableName.TEST_TIMES,
      selectQuery: '*, testers_session!inner(*)',
      condition: 'testers_session.test_id',
      value: testId,
      single: false,
      additionalConditions: [
        {
          key: 'testers_session.variation_type' as any,
          value: variationType,
        },
      ],
    });
  }

  public cleanInvalidTesterSessions(prolificIds: string[]) {
    return this.supabaseService.delete(TableName.TESTERS_SESSION, {
      prolific_pid: prolificIds,
    });
  }

  public async getTestIdByProlificStudyId(prolificStudyId: string) {
    try {
      const { test_id } =
        await this.supabaseService.getByCondition<TestVariation>({
          tableName: TableName.TEST_VARIATIONS,
          selectQuery: 'test_id',
          condition: 'prolific_test_id',
          value: prolificStudyId,
          single: true,
        });

      return test_id;
    } catch (error) {
      throw new NotFoundException(
        `Failed to find test variation with study id ${prolificStudyId}`,
      );
    }
  }

  public updateTestStatus(testId: string, status: TestStatus) {
    this.testStatusGateway.emitTestStatusUpdate(testId, status);

    return this.supabaseService.update<Test>(TableName.TESTS, { status }, [
      { key: 'id', value: testId },
    ]);
  }

  public async publishTest(testId: string) {
    // TODO: Add rollback for each variation. 
    
    try {
      const test = await this.getTestById(testId);
      const testDemographics = await this.getTestDemographics(testId);

      // Calculate required credits
      const requiredCredits = this.creditsService.calculateTestCredits(
        testDemographics.tester_count,
        testDemographics.custom_screening_enabled,
      );

      // Check if company has enough credits
      const availableCredits =
        await this.creditsService.getCompanyAvailableCredits(test.company_id);

      if (availableCredits < requiredCredits) {
        throw new BadRequestException('Insufficient credits.');
      }

      // Create credit usage record BEFORE publishing
      await this.creditsService.saveCreditUsage(
        test.company_id,
        testId,
        requiredCredits,
      );

      const testVariations = await this.getTestVariations(testId);

      // Check Prolific balance before publishing any studies
      await this.prolificService.checkBalanceForTestPublishing(
        testVariations.map(({ prolific_test_id }) => prolific_test_id),
      );

      // Publish each variation
      // TODO: Split this into its own separated function
      for (const variation of testVariations) {
        try {
          await this.prolificService.publishStudy(variation.prolific_test_id);
          await this.testMonitoringService.scheduleTestCompletionCheck(
            variation.prolific_test_id,
            testId,
          );

          // Wait 30 second before processing the next variation
          await new Promise((resolve) => setTimeout(resolve, 30000));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : `Failed to publish study for variation ${variation.variation_type}`;
          throw new BadRequestException(errorMessage);
        }
      }

      this.logger.log(
        `Successfully published test ${testId} with ${requiredCredits} credits used`,
      );
      return testVariations;
    } catch (error) {
      this.logger.error(`Failed to publish test ${testId}:`, error);

      throw error;
    }
  }

  private transformTestData(data: RawTestData): TestData {
    const surveysByType = this.groupResponsesByType(
      data.responses_surveys || [],
    );
    const comparisonsByType = this.groupResponsesByType(
      data.responses_comparisons || [],
    );

    return {
      id: data.id,
      name: data.name,
      objective: data.objective,
      status: data.status,
      searchTerm: data.search_term,
      competitors: data.competitors?.map((c) => c.product) || [],
      variations: {
        a: this.getVariationWithProduct(data.variations, 'a'),
        b: this.getVariationWithProduct(data.variations, 'b'),
        c: this.getVariationWithProduct(data.variations, 'c'),
      },
      demographics: {
        ageRanges: data.demographics?.[0]?.age_ranges || [],
        gender: data.demographics?.[0]?.genders || [],
        locations: data.demographics?.[0]?.locations || [],
        interests: data.demographics?.[0]?.interests || [],
        testerCount: data.demographics?.[0]?.tester_count || 0,
      },
      completed_sessions:
        (data.responses_surveys?.length || 0) +
        (data.responses_comparisons?.length || 0),
      responses: {
        surveys: surveysByType,
        comparisons: comparisonsByType,
      },
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  private groupResponsesByType(
    responses: Array<{ tester_id: { variation_type: string } }>,
  ) {
    return responses.reduce((acc, item) => {
      const type = item.tester_id.variation_type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(item);
      return acc;
    }, {});
  }

  private getVariationWithProduct(
    variations: Array<{
      product: Product;
      variation_type: string;
      prolific_status: string | null;
    }>,
    type: 'a' | 'b' | 'c',
  ): ProductWithProlificStatus | null {
    const variation = variations?.find((v) => v.variation_type === type);
    return variation
      ? { ...variation.product, prolificStatus: variation.prolific_status }
      : null;
  }
}
