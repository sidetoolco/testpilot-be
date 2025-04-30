import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TableName } from 'lib/enums';
import { calculateAverageScore } from 'lib/helpers';
import {
  AiInsight,
  ResponseSurvey,
  TestVariation,
  TestSummary,
} from 'lib/interfaces/entities.interface';
import { OpenAiService } from 'open-ai/open-ai.service';
import { ProductsService } from 'products/products.service';
import { ProlificService } from 'prolific/prolific.service';
import { SupabaseService } from 'supabase/supabase.service';
import { TestsService } from 'tests/tests.service';
import { GENERATE_INSIGHTS_PROMPT } from './constants';
import { TestData } from 'tests/interfaces';
import { insightsFormatter } from './formatters';

interface VariantMetrics {
  appearance: number;
  confidence: number;
  convenience: number;
  brand: number;
  value: number;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly testsService: TestsService,
    private readonly prolificService: ProlificService,
    private readonly productsService: ProductsService,
    private readonly supabaseService: SupabaseService,
    private readonly openAiService: OpenAiService,
  ) {}

  public async saveAiInsights(testId: string) {
    try {
      if (!testId) {
        throw new BadRequestException('Test ID is required');
      }
      this.logger.log(`Generating AI insights for test ${testId}`);
      const aiInsights = await this.generateAiInsights(testId);

      this.logger.log(`Saving AI insights for test ${testId}`);
      return await this.supabaseService.upsert<AiInsight>(
        TableName.AI_INSIGHTS,
        {
          test_id: testId,
          ...aiInsights,
        },
        'test_id',
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate AI insights for test ${testId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Genera insights detallados para un estudio específico, procesando datos de encuestas por variantes,
   * métricas de variantes y comparaciones competitivas.
   *
   * @param {string} studyId - ID del estudio para el cual se generarán los insights
   * @returns {Promise<{
   *   testId: string,
   *   variation: string,
   *   summaries: any[],
   *   purchaseDrivers: any[],
   *   competitiveInsights: any[]
   * }>} Objeto con los insights generados, incluyendo resumen de métricas,
   * factores de compra y comparaciones competitivas
   * @throws {BadRequestException} Si no se proporciona un ID de estudio
   * @throws {NotFoundException} Si el estudio o la variante no se encuentran
   */
  public async generateStudyInsights(studyId: string) {
    if (!studyId) {
      throw new BadRequestException('Study ID is required');
    }

    this.logger.log(`Generating insights for study ${studyId}`);

    try {
      const study = await this.prolificService.getStudy(studyId);
      if (!study) {
        throw new NotFoundException(`Study ${studyId} not found`);
      }

      const { variation, testId } = this.extractTestInfo(study);
      if (!variation || !testId) {
        throw new BadRequestException(
          'Invalid study format - missing variation or test ID',
        );
      }

      const formattedStatus = this.prolificService.formatStatus(study.status);
      await this.testsService.updateTestVariationStatus(
        formattedStatus,
        testId,
        variation,
      );

      const [test, testVariations] = await Promise.all([
        this.testsService.getTestById(testId),
        this.testsService.getTestVariations(testId),
      ]);

      const variantChoosen = testVariations.find(
        (v) => v.variation_type === variation,
      );
      if (!variantChoosen) {
        throw new NotFoundException(
          `Variant ${variation} not found for test ${testId}`,
        );
      }

      const [chosenTimes, surveys, totalClicksPerVariant] = await Promise.all([
        this.testsService.getTestTimesByProductId(variantChoosen.product_id),
        this.productsService.getProductSurveys(
          variantChoosen.product_id,
          testId,
        ),
        this.testsService.getTestTimesByTestVariation(
          testId,
          variantChoosen.variation_type,
        ),
      ]);

      const totalAverage = this.calculateTotalAverage(surveys);
      const summary = this.generateVariantSummary(
        test.name,
        variantChoosen.product.title,
        testId,
        variantChoosen.variation_type,
        surveys.length,
        totalClicksPerVariant.length,
        chosenTimes.length,
        totalAverage,
      );

      const [variantPurchaseDrivers, variantCompetitiveInsights, savedSummary] =
        await Promise.all([
          this.purchaseDrivers(testId, variation),
          this.competitiveInsights(test, variantChoosen, testId),
          this.saveInsights(
            testId,
            summary.shareOfBuy,
            summary.shareOfClicks,
            summary.valuescore,
            variantChoosen.variation_type,
            variantChoosen.product_id,
          ),
        ]);

      await this.saveInsightStatus(testId, variantChoosen.variation_type);

      return {
        testId,
        variation,
        summaries: [savedSummary],
        purchaseDrivers: [variantPurchaseDrivers],
        competitiveInsights: variantCompetitiveInsights,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate insights for study ${studyId}:`,
        error,
      );
      throw error;
    }
  }

  private extractTestInfo(study: any) {
    const variationMatch = study.internal_name?.match(/-(\w)$/);
    const variation = variationMatch ? variationMatch[1] : null;
    const testId = study.internal_name?.replace(/-\w$/, '') || null;
    return { variation, testId };
  }

  async competitiveInsights(
    test: TestData,
    variation: TestVariation,
    testId: string,
  ) {
    try {
      const [testCompetitors, competitorsComparison] = await Promise.all([
        this.supabaseService.findMany(
          TableName.TEST_COMPETITORS,
          {
            test_id: testId,
          },
          `
          *,
          product:amazon_products ( title, image_url, price, rating, reviews_count )
        `,
        ),
        this.supabaseService.findMany(TableName.RESPONSES_COMPARISONS, {
          test_id: testId,
          product_id: variation.product_id,
        }),
      ]);

      if (!testCompetitors?.length) {
        throw new NotFoundException('Test competitors not found');
      }

      const groupedData = this.groupCompetitorMetrics(competitorsComparison);
      const results = this.calculateCompetitorResults(
        testCompetitors,
        groupedData,
        variation,
        testId,
        competitorsComparison.length,
      );

      // ['test_id', 'variant_type', 'competitor_product_id'] agrupar por test_id, variant_type, competitor_product_id
      return await Promise.all(
        results.map((result) =>
          this.supabaseService.upsert(
            TableName.COMPETITIVE_INSIGHTS,
            result,
            'competitor_product_id,test_id,variant_type',
          ),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate competitive insights for test ${testId}:`,
        error,
      );
      throw error;
    }
  }

  private groupCompetitorMetrics(comparisons: any[]): Record<string, any> {
    return comparisons.reduce<Record<string, any>>((acc, curr) => {
      const competitor_id = curr.competitor_id || curr['competitor_product_id'];
      if (!competitor_id) {
        this.logger.warn('Missing competitor_id in comparison:', curr);
        return acc;
      }

      if (!acc[competitor_id]) {
        acc[competitor_id] = {
          count: 0,
          shareofbuy: 0,
          averageValue: 0,
          averageAppearance: 0,
          averageConfidence: 0,
          averageBrand: 0,
          averageConvenience: 0,
        };
      }

      acc[competitor_id].count++;
      acc[competitor_id].averageValue +=
        curr.value || curr['average_value'] || 0;
      acc[competitor_id].averageAppearance +=
        curr.appearance || curr['average_appearance'] || 0;
      acc[competitor_id].averageConfidence +=
        curr.confidence || curr['average_confidence'] || 0;
      acc[competitor_id].averageBrand +=
        curr.brand || curr['average_brand'] || 0;
      acc[competitor_id].averageConvenience +=
        curr.convenience || curr['average_convenience'] || 0;

      return acc;
    }, {});
  }

  private calculateCompetitorResults(
    competitors: any[],
    groupedData: Record<string, any>,
    variation: TestVariation,
    testId: string,
    totalResponses: number,
  ) {
    return competitors.map((competitor) => {
      const metrics = groupedData[competitor.id] ||
        groupedData[competitor.product_id] || {
          count: 0,
          shareofbuy: 0,
          averageValue: 0,
          averageAppearance: 0,
          averageConfidence: 0,
          averageBrand: 0,
          averageConvenience: 0,
        };

      const count = metrics.count;

      return {
        variant_type: variation.variation_type,
        test_id: testId,
        competitor_product_id: competitor.product_id,
        aesthetics: this.calculateAverage(metrics.averageAppearance, count),
        utility: this.calculateAverage(metrics.averageConfidence, count),
        convenience: this.calculateAverage(metrics.averageConvenience, count),
        trust: this.calculateAverage(metrics.averageBrand, count),
        value: this.calculateAverage(metrics.averageValue, count),
        share_of_buy: this.calculateShareOfBuy(count, totalResponses),
        count,
      };
    });
  }

  private calculateAverage(sum: number, count: number): number {
    return count > 0 ? Number((sum / count).toFixed(1)) : 0;
  }

  private calculateShareOfBuy(count: number, total: number): number {
    return Number(((count / total) * 100).toFixed(1));
  }

  async purchaseDrivers(testId: string, variant: string) {
    try {
      const [test, variation] = await Promise.all([
        this.supabaseService.findOne(TableName.TESTS, { id: testId }),
        this.supabaseService.findOne<TestVariation>(TableName.TEST_VARIATIONS, {
          test_id: testId,
          variation_type: variant,
        }),
      ]);

      if (!test) throw new NotFoundException('Test not found');
      if (!variation) throw new NotFoundException('Variation not found');

      const responses = await this.supabaseService.findMany<
        ResponseSurvey & { test_id: string; product_id: string }
      >(TableName.RESPONSES_SURVEYS, {
        test_id: testId,
        product_id: variation.product_id,
      });

      if (!responses?.length) throw new NotFoundException('No responses found');

      const totals = this.calculateResponseTotals(responses);
      const count = responses.length;
      const payload = this.createPurchaseDriversPayload(
        testId,
        variant,
        variation.product_id,
        totals,
        count,
      );

      // ['test_id', 'variant_type'] agrupar por test_id, variant_type
      return await this.supabaseService.upsert<typeof payload>(
        TableName.PURCHASE_DRIVERS,
        payload,
        'test_id,variant_type,product_id',
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate purchase drivers for test ${testId}, variant ${variant}:`,
        error,
      );
      throw error;
    }
  }

  private calculateResponseTotals(responses: ResponseSurvey[]): VariantMetrics {
    return responses.reduce<VariantMetrics>(
      (acc, item) => {
        acc.appearance += item.appearance;
        acc.confidence += item.confidence;
        acc.convenience += item.convenience;
        acc.brand += item.brand;
        acc.value += item.value;
        return acc;
      },
      {
        appearance: 0,
        confidence: 0,
        convenience: 0,
        brand: 0,
        value: 0,
      },
    );
  }

  private createPurchaseDriversPayload(
    testId: string,
    variant: string,
    productId: string,
    totals: VariantMetrics,
    count: number,
  ) {
    const round = (n: number) => parseFloat((n / count).toFixed(1));

    return {
      test_id: testId,
      variant_type: variant,
      product_id: productId,
      appearance: round(totals.appearance),
      confidence: round(totals.confidence),
      convenience: round(totals.convenience),
      brand: round(totals.brand),
      value: round(totals.value),
      count,
    };
  }

  public async getInsightsData(testId: string) {
    const test = await this.testsService.getTestById(testId);
    const demographics = await this.testsService.getTestDemographics(testId);
    const variantSummaries = await this.testsService.getTestSummaries(testId);
    const competitorsInsights =
      await this.testsService.getCompetitorInsights(testId);

    return {
      test_metadata: {
        test_id: test.id,
        objective: test.objective,
        test_type: 'Variant-Based',
        sample_size: demographics.tester_count,
        created_date: test.createdAt,
        search_term: test.searchTerm,
      },
      audience: {
        demographics: {
          age_ranges: demographics.age_ranges,
          gender: demographics.genders,
          location: demographics.locations,
        },
      },
      variants: Object.entries(test.variations).reduce(
        (acc, [variantName, variantInfo]) => {
          if (variantInfo) {
            const variantSummary = variantSummaries.find(
              ({ variant_type }) => variant_type === variantName,
            );
            acc.push({
              id: variantName,
              title: variantInfo.title,
              price: variantInfo.price,
              click_share: variantSummary?.share_of_click,
              buy_share: variantSummary?.share_of_buy,
              value_score: variantSummary?.value_score,
              // TODO: Add these fields
              //   trust_score: 4.4,
              //   aesthetics_score: 2.8,
              //   utility_score: 3.6,
              //   convenience_score: 3.1,
            });
          }

          return acc;
        },
        [],
      ),
      competitors_detailed: Object.values(competitorsInsights).map(
        (insights) => ({
          name: insights.title,
          price: insights.price,
          results_by_variant: insights.variants,
        }),
      ),
    };
  }

  private saveInsightStatus(testId: string, variantType: string) {
    return this.supabaseService.insert(TableName.INSIGHT_STATUS, {
      test_id: testId,
      variant_type: variantType,
      insight_data: 'summary',
    });
  }

  private calculateTotalAverage(surveys: ResponseSurvey[]) {
    // Calcular el promedio por encuesta
    const individualAverages = surveys.map((survey) => {
      const metrics = [
        survey.appearance,
        survey.confidence,
        survey.value,
        survey.convenience,
        survey.brand,
      ];
      return calculateAverageScore(metrics);
    });

    // Calcular el promedio total de todos los promedios individuales
    const totalAverage = calculateAverageScore(individualAverages);

    return totalAverage;
  }

  private generateVariantSummary(
    testName: string,
    productTitle: string,
    testId: string,
    variant: string,
    surveysAmount: number,
    totalClicksPerVariant: number,
    chosenTimesAmount: number,
    totalAverage: number,
  ) {
    const shareOfBuy = ((surveysAmount / totalClicksPerVariant) * 100).toFixed(
      1,
    );
    const shareOfClicks = (
      (chosenTimesAmount / totalClicksPerVariant) *
      100
    ).toFixed(1);

    return {
      name: testName,
      productTitle: productTitle,
      testid: testId,
      variant,
      valuescore: Number(totalAverage.toFixed(1)),
      shareOfBuy: Number(shareOfBuy),
      shareOfClicks: Number(shareOfClicks),
    };
  }

  private async saveInsights(
    testId: string,
    shareOfBuy: number,
    shareOfClick: number,
    valueScore: number,
    variantType: string,
    productId: string,
  ) {
    return this.supabaseService.upsert(
      TableName.TEST_SUMMARY,
      {
        test_id: testId,
        share_of_buy: shareOfBuy,
        share_of_click: shareOfClick,
        value_score: valueScore,
        variant_type: variantType,
        product_id: productId,
        win: false,
      },
      'product_id,test_id,variant_type',
    );
  }

  private async generateAiInsights(testId: string) {
    const formattedData = await this.getInsightsData(testId);

    const unformattedInsights = await this.openAiService.createChatCompletion([
      {
        role: 'system',
        content: GENERATE_INSIGHTS_PROMPT,
      },
      {
        role: 'user',
        content: `Here is the test data to analyze:\n\n${formattedData}`,
      },
    ]);

    return insightsFormatter(unformattedInsights);
  }

  private async fetchStudyData(studyId: string) {
    const study = await this.prolificService.getStudy(studyId);
    const variationMatch = study.internal_name?.match(/-(\w)$/);
    const variation = variationMatch ? variationMatch[1] : null;
    const testId = study.internal_name?.replace(/-\w$/, '') || null;
    const formattedStatus = this.prolificService.formatStatus(study.status);

    if (variation && testId) {
      await this.testsService.updateTestVariationStatus(
        formattedStatus,
        testId,
        variation,
      );
    }

    const test = await this.testsService.getTestById(testId);
    const testVariations = await this.testsService.getTestVariations(testId);

    return { test, testVariations, testId };
  }

  private async processVariant(test: any, variant: any, testId: string) {
    // Parallelize independent queries
    const [chosenTimes, surveys, totalClicksPerVariant] = await Promise.all([
      this.testsService.getTestTimesByProductId(variant.product_id),
      this.productsService.getProductSurveys(variant.product_id, testId),
      this.testsService.getTestTimesByTestVariation(
        testId,
        variant.variation_type,
      ),
    ]);

    const totalAverage = this.calculateTotalAverage(surveys);

    const summary = this.generateVariantSummary(
      test.name,
      variant.product.title,
      testId,
      variant.variation_type,
      surveys.length,
      totalClicksPerVariant.length,
      chosenTimes.length,
      totalAverage,
    );

    await this.saveInsightStatus(testId, variant.variation_type);

    const savedSummary = await this.saveInsights(
      testId,
      summary.shareOfBuy,
      summary.shareOfClicks,
      summary.valuescore,
      variant.variation_type,
      variant.product_id,
    );

    return savedSummary;
  }
}
