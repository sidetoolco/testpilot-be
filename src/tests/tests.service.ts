import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class TestsService {
  constructor(private readonly supabaseService: SupabaseService) {}

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
