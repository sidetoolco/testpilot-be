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
  Event,
  ResponseComparison,
  ResponseSurvey,
  TestVariation,
} from 'lib/interfaces/entities.interface';
import { OpenAiService } from 'open-ai/open-ai.service';
import { ProductsService } from 'products/products.service';
import { ProlificService } from 'prolific/prolific.service';
import { SupabaseService } from 'supabase/supabase.service';
import { TestsService } from 'tests/tests.service';
import {
  insightsFormatter,
  surveyResponsesForSummaryFormatter,
} from './formatters';
import { AdalineService } from 'adaline/adaline.service';
import { TestObjective } from 'tests/enums';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

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
    private readonly adalineService: AdalineService,
  ) {}

  public async generateSummaryForTest(testId: string) {
    try {
      this.logger.log(`🚀 Starting generateSummaryForTest for test ${testId}`);
      const test = await this.testsService.getTestById(testId);
      const testVariations = await this.testsService.getTestVariations(testId);

      this.logger.log(`📊 Found ${testVariations.length} test variations:`, testVariations.map(v => ({ id: v.id, variation_type: v.variation_type, product_id: v.product_id })));

      const results = [];

      for (const variation of testVariations) {
        try {
          this.logger.log(`Generating summary for variant ${variation.variation_type}`);
          
          // Get survey responses for this variant
          const surveys = await this.getSurveyResponsesForVariant(testId, variation.variation_type);
          
          // For Walmart tests, also try to get comparison responses if no survey responses
          let responses = surveys;
          if (responses.length === 0) {
            this.logger.log(`No survey responses found for variant ${variation.variation_type}, trying comparison responses`);
            responses = await this.getComparisonResponses(testId, variation.product_id);
          }
          
          if (responses.length > 0) {
            const shopperCount = responses.length;
            const totalAverage = this.calculateTotalAverage(responses as any);
            
            // Get total selections for this variant to match competitive insights calculation
            const totalSelectionsForVariant = await this.getTotalSelectionsForVariant(testId, variation.variation_type);
            
            const summary = this.generateVariantSummary(
              test.name,
              variation.product?.title || 'Unknown Product',
              testId,
              variation.variation_type,
              responses.length,
              await this.calculateShareOfClicks(testId, variation.product_id),
              totalAverage,
              totalSelectionsForVariant, // Use same denominator as competitive insights
            );

            // Generate and save insights for this variant (same as Prolific flow)
            this.logger.log(`🔄 Starting insights generation for variant ${variation.variation_type}`);
            
            const [variantPurchaseDrivers, variantCompetitiveInsights, savedSummary] =
              await Promise.all([
                this.purchaseDrivers(testId, variation.variation_type),
                this.competitiveInsights(variation, testId, totalSelectionsForVariant),
                this.saveInsights(
                  testId,
                  Number(summary.shareOfBuy),
                  Number(summary.shareOfClicks),
                  Number(summary.valuescore),
                  variation.variation_type,
                  variation.product_id,
                ),
              ]);

            this.logger.log(`✅ Successfully generated insights for variant ${variation.variation_type}:`, {
              purchaseDrivers: variantPurchaseDrivers ? 'Generated' : 'Failed',
              competitiveInsights: variantCompetitiveInsights ? `${variantCompetitiveInsights.length} items` : 'Failed',
              summary: savedSummary ? 'Saved' : 'Failed'
            });

            await this.saveInsightStatus(testId, variation.variation_type);

            results.push({
              variant: variation.variation_type,
              summary: savedSummary,
              purchaseDrivers: variantPurchaseDrivers,
              competitiveInsights: variantCompetitiveInsights,
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to generate summary for variant ${variation.variation_type}:`,
            error,
          );
        }
      }

      this.logger.log(`🎉 generateSummaryForTest completed for test ${testId}:`, {
        totalResults: results.length,
        results: results.map(r => ({ variant: r.variant, hasCompetitiveInsights: !!r.competitiveInsights }))
      });


      return {
        testId,
        results,
        message: `Successfully generated summary data for ${results.length} variants`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate summary for test ${testId}:`,
        error,
      );
      throw error;
    }
  }


  private async getSurveyResponsesForVariant(testId: string, variantType: string) {
    // Get survey responses for the specific variant
    const surveys = await this.supabaseService.findMany(
      TableName.RESPONSES_SURVEYS,
      { test_id: testId },
      '*, tester_id'
    );

    // Get only completed Prolific sessions (prolific_pid + ended_at) for this test
    const sessions = await this.supabaseService.findMany(
      TableName.TESTERS_SESSION,
      { 
        test_id: testId,
        prolific_pid: { not: null }, // Has Prolific participant ID
        ended_at: { not: null } // Session was completed
      },
      'id, variation_type'
    );

    // Create a map of tester_id to variation_type
    const sessionMap = new Map();
    sessions.forEach((session: any) => {
      sessionMap.set(session.id, session.variation_type);
    });

    // Filter surveys by variant type
    const variantSurveys = surveys.filter((survey: any) => {
      const variationType = sessionMap.get(survey.tester_id);
      return variationType === variantType;
    });

    return variantSurveys;
  }

  private async getComparisonResponses(testId: string, productId: string) {
    // Check if this is a Walmart test by looking at test_competitors
    const competitors = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId },
      'product_type'
    );

    const isWalmartTest = competitors.some((c: any) => c.product_type === 'walmart_product');

    if (isWalmartTest) {
      // For Walmart tests, use responses_comparisons_walmart
      return await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS_WALMART,
        { test_id: testId, product_id: productId },
        '*'
      );
    } else {
      // For Amazon tests, use responses_comparisons
      return await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS,
        { test_id: testId, product_id: productId },
        '*'
      );
    }
  }

  private async getTotalSelectionsForVariant(testId: string, variantType: string): Promise<number> {
    // Get all survey responses for this test
    const surveys = await this.supabaseService.findMany(
      TableName.RESPONSES_SURVEYS,
      { test_id: testId },
      '*, tester_id'
    );
    
    // Get only completed Prolific sessions (prolific_pid + ended_at) for this test
    const sessions = await this.supabaseService.findMany(
      TableName.TESTERS_SESSION,
      { 
        test_id: testId,
        prolific_pid: { not: null }, // Has Prolific participant ID
        ended_at: { not: null } // Session was completed
      },
      'id, variation_type'
    );

    // Create a map of tester_id to variation_type
    const sessionMap = new Map();
    sessions.forEach((session: any) => {
      sessionMap.set(session.id, session.variation_type);
    });

    // Filter surveys by variant type
    const variantSurveys = surveys.filter((survey: any) => {
      const variationType = sessionMap.get(survey.tester_id);
      return variationType === variantType;
    });

    // Get comparison responses for this specific variant
    const competitors = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId },
      'product_type'
    );

    const isWalmartTest = competitors.some((c: any) => c.product_type === 'walmart_product');

    let variantComparisons = [];
    if (isWalmartTest) {
      const allComparisons = await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS_WALMART,
        { test_id: testId },
        '*, tester_id'
      );
      variantComparisons = allComparisons.filter((comparison: any) => {
        const variationType = sessionMap.get(comparison.tester_id);
        return variationType === variantType;
      });
    } else {
      const allComparisons = await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS,
        { test_id: testId },
        '*, tester_id'
      );
      variantComparisons = allComparisons.filter((comparison: any) => {
        const variationType = sessionMap.get(comparison.tester_id);
        return variationType === variantType;
      });
    }

    const totalSelections = variantSurveys.length + variantComparisons.length;
    
    // Safety check to prevent division by zero
    if (totalSelections === 0) {
      this.logger.warn(`⚠️  WARNING: totalSelections is 0 for variant ${variantType}. This will cause division by zero.`);
      return 1; // Return 1 to prevent division by zero, but log the issue
    }
    
    return totalSelections;
  }

  public async saveAiInsights(testId: string) {
    try {
      this.logger.log(`Generating AI insights for test ${testId}`);
      const { objective } = await this.testsService.getTestById(testId);
      
      const testVariations = await this.testsService.getTestVariations(testId);

      // Generate cross-variant purchase drivers once using full test data
      const crossVariantInsights = await this.generateCrossVariantInsights(testId, objective);
      
      // Generate variant-specific competitive insights
      const variantInsights: Record<string, any> = {};
      
      for (const variation of testVariations) {
        try {
          this.logger.log(
            `Generating competitive insights for variant ${variation.variation_type}`,
          );
          const competitiveInsights = await this.generateCompetitiveInsightsForVariant(
            testId,
            objective,
            variation.variation_type,
          );
          
          variantInsights[variation.variation_type] = competitiveInsights;
        } catch (error) {
          this.logger.error(
            `Failed to generate competitive insights for variant ${variation.variation_type}:`,
            error,
          );
          // Continue with other variants even if one fails
        }
      }

      // Combine cross-variant insights with variant-specific competitive insights
      const combinedInsights = this.combineVariantInsights(crossVariantInsights, variantInsights, testVariations);
      
      const savedInsight = await this.supabaseService.upsert<AiInsight>(
        TableName.AI_INSIGHTS,
        {
          test_id: testId,
          ...combinedInsights,
        },
        'test_id',
      );

      return [savedInsight];
    } catch (error) {
      this.logger.error(
        `Failed to generate or save AI insights for test ${testId}:`,
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
      const invalidStudySubmissions =
        await this.prolificService.getStudySubmissions(studyId, true);

      await this.testsService.cleanInvalidTesterSessions(
        invalidStudySubmissions.map(({ participant_id }) => participant_id),
      );

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
        this.testsService.getRawDataByTestId(testId),
        this.testsService.getTestVariations(testId),
      ]);
      //total shopper per session
      const shopperCount = test.demographics?.testerCount || 0;

      const variantChoosen = testVariations.find(
        (v) => v.variation_type === variation,
      );
      if (!variantChoosen) {
        throw new NotFoundException(
          `Variant ${variation} not found for test ${testId}`,
        );
      }

      const surveys = await this.productsService.getProductSurveys(
        variantChoosen.product_id,
        testId,
      );

      const totalAverage = this.calculateTotalAverage(surveys);
      
      // Get total selections for this variant to match competitive insights calculation
      const totalSelectionsForVariant = await this.getTotalSelectionsForVariant(testId, variantChoosen.variation_type);
      
      const summary = this.generateVariantSummary(
        test.name,
        variantChoosen.product.title,
        testId,
        variantChoosen.variation_type,
        surveys.length,
        await this.calculateShareOfClicks(testId, variantChoosen.product_id),
        totalAverage,
        totalSelectionsForVariant, // Use same denominator as competitive insights
      );

      const [variantPurchaseDrivers, variantCompetitiveInsights, savedSummary] =
        await Promise.all([
          this.purchaseDrivers(testId, variation),
          this.competitiveInsights(variantChoosen, testId, totalSelectionsForVariant),
          this.saveInsights(
            testId,
            Number(summary.shareOfBuy),
            Number(summary.shareOfClicks),
            Number(summary.valuescore),
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
    variation: TestVariation,
    testId: string,
    shopperCount: number,
  ) {
    try {
      this.logger.log(`Starting competitive insights generation for test ${testId}, variant ${variation.variation_type}`);
      
      const [testCompetitors, competitorsComparison] = await Promise.all([
        this.getTestCompetitors(testId),
        this.getComparisonResponsesForVariant(testId, variation.variation_type),
      ]);

      this.logger.log(`Found ${testCompetitors?.length || 0} competitors and ${competitorsComparison?.length || 0} comparison responses`);

      if (!testCompetitors?.length) {
        throw new NotFoundException('Test competitors not found');
      }

      if (!competitorsComparison?.length) {
        this.logger.warn('No comparison responses found for competitive insights');
        return [];
      }

      const groupedData = this.groupCompetitorMetrics(competitorsComparison);
      this.logger.log(`Grouped data keys: ${Object.keys(groupedData).join(', ')}`);
      
      const results = this.calculateCompetitorResults(
        testCompetitors,
        groupedData,
        variation,
        testId,
        shopperCount,
      );

      this.logger.log(`Generated ${results.length} competitive insight results`);

      // Determine which table to use based on test type
      const isWalmartTest = testCompetitors.some((c: any) => c.product_type === 'walmart_product');
      const tableName = isWalmartTest ? TableName.COMPETITIVE_INSIGHTS_WALMART : TableName.COMPETITIVE_INSIGHTS;
      
      this.logger.log(`Using table ${tableName} for competitive insights`);
      this.logger.log(`Test competitors: ${JSON.stringify(testCompetitors.map(c => ({ id: c.id, product_id: c.product_id, product_type: c.product_type })))}`);
      this.logger.log(`Results to save: ${JSON.stringify(results.map(r => ({ competitor_product_id: r.competitor_product_id, variant_type: r.variant_type })))}`);
      
      // ['test_id', 'variant_type', 'competitor_product_id'] agrupar por test_id, variant_type, competitor_product_id
      this.logger.log(`Attempting to save ${results.length} results to ${tableName}`);
      
      const savedResults = await Promise.all(
        results.map(async (result, index) => {
          try {
            this.logger.log(`Saving result ${index + 1}/${results.length}:`, result);
            const saved = await this.supabaseService.upsert(
              tableName,
              result,
              'competitor_product_id,test_id,variant_type',
            );
            this.logger.log(`Successfully saved result ${index + 1}`);
            return saved;
          } catch (error) {
            this.logger.error(`Failed to save result ${index + 1}:`, error);
            throw error;
          }
        }),
      );

      this.logger.log(`Successfully saved ${savedResults.length} competitive insights`);
      return savedResults;
    } catch (error) {
      this.logger.error(
        `Failed to generate competitive insights for test ${testId}:`,
        error,
      );
      throw error;
    }
  }

  private async getTestCompetitors(testId: string) {
    // Get test competitors with their product details
    const competitors = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId },
      'id, test_id, product_id, product_type'
    );

    if (!competitors?.length) {
      return [];
    }

    // Enrich with product details based on product_type
    const enrichedCompetitors = await Promise.all(
      competitors.map(async (competitor: any) => {
        const enriched = { ...competitor };

        if (competitor.product_type === 'walmart_product' && competitor.product_id) {
          try {
            const walmartProduct = await this.supabaseService.getById({
              tableName: TableName.WALMART_PRODUCTS,
              id: competitor.product_id,
              selectQuery: 'id, title, image_url, price, rating, reviews_count',
            });
            if (walmartProduct) {
              enriched.product = walmartProduct;
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch Walmart product ${competitor.product_id}:`, error);
          }
        } else if (competitor.product_type === 'amazon_product' && competitor.product_id) {
          try {
            const amazonProduct = await this.supabaseService.getById({
              tableName: TableName.AMAZON_PRODUCTS,
              id: competitor.product_id,
              selectQuery: 'id, title, image_url, price, rating, reviews_count',
            });
            if (amazonProduct) {
              enriched.product = amazonProduct;
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch Amazon product ${competitor.product_id}:`, error);
          }
        }

        return enriched;
      })
    );

    return enrichedCompetitors;
  }

  private async getAllComparisonResponses(testId: string) {
    // Check if this is a Walmart test by looking at test_competitors
    const competitors = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId },
      'product_type'
    );

    const isWalmartTest = competitors.some((c: any) => c.product_type === 'walmart_product');

    if (isWalmartTest) {
      // For Walmart tests, get ALL comparison responses for the test
      return await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS_WALMART,
        { test_id: testId },
        '*'
      );
    } else {
      // For Amazon tests, get ALL comparison responses for the test
      return await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS,
        { test_id: testId },
        '*'
      );
    }
  }

  private async getComparisonResponsesForVariant(testId: string, variantType: string) {
    // Check if this is a Walmart test by looking at test_competitors
    const competitors = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId },
      'product_type'
    );

    const isWalmartTest = competitors.some((c: any) => c.product_type === 'walmart_product');

    // Get only completed Prolific sessions (prolific_pid + ended_at) for this test
    const sessions = await this.supabaseService.findMany(
      TableName.TESTERS_SESSION,
      { 
        test_id: testId,
        prolific_pid: { not: null }, // Has Prolific participant ID
        ended_at: { not: null } // Session was completed
      },
      'id, variation_type'
    );

    // Create a map of tester_id to variation_type
    const sessionMap = new Map();
    sessions.forEach((session: any) => {
      sessionMap.set(session.id, session.variation_type);
    });

    if (isWalmartTest) {
      // For Walmart tests, get comparison responses for the specific variant
      const allResponses = await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS_WALMART,
        { test_id: testId },
        '*, tester_id'
      );
      
      // Filter by variant type using session mapping
      const filteredResponses = allResponses.filter((response: any) => {
        const variationType = sessionMap.get(response.tester_id);
        return variationType === variantType;
      });
      
      return filteredResponses;
    } else {
      // For Amazon tests, get comparison responses for the specific variant
      const allResponses = await this.supabaseService.findMany(
        TableName.RESPONSES_COMPARISONS,
        { test_id: testId },
        '*, tester_id'
      );
      
      // Filter by variant type using session mapping
      const filteredResponses = allResponses.filter((response: any) => {
        const variationType = sessionMap.get(response.tester_id);
        return variationType === variantType;
      });
      
      return filteredResponses;
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
    shopperCount: number,
  ) {
    this.logger.log(`Calculating competitor results for ${competitors.length} competitors`);
    this.logger.log(`Grouped data keys: ${Object.keys(groupedData).join(', ')}`);
    
    // Calculate total selections for this specific variant
    const totalSelectionsForVariant = Object.values(groupedData).reduce(
      (total: number, metrics: any) => total + metrics.count,
      0
    );
    
    this.logger.log(`Total selections for variant: ${totalSelectionsForVariant}`);

    return competitors.map((competitor) => {
      this.logger.log(`Processing competitor: ${competitor.product_id}`);
      
      // The groupedData is keyed by competitor_id from responses, which matches competitor.product_id
      const metrics = groupedData[competitor.product_id] || {
        count: 0,
        shareofbuy: 0,
        averageValue: 0,
        averageAppearance: 0,
        averageConfidence: 0,
        averageBrand: 0,
        averageConvenience: 0,
      };
      
      this.logger.log(`Metrics for ${competitor.product_id}:`, metrics);

      const count = metrics.count;

      const shareOfBuy = totalSelectionsForVariant > 0 
        ? ((count / totalSelectionsForVariant) * 100).toFixed(2)
        : '0.00';

      // Generate a unique ID for the insert
      const id = Date.now() + Math.floor(Math.random() * 1000);
      
      return {
        id: id,
        variant_type: variation.variation_type,
        test_id: testId,
        competitor_product_id: competitor.product_id,
        aesthetics: (
          this.calculateAverage(metrics.averageAppearance, count) - 3
        ).toFixed(2),
        utility: (
          this.calculateAverage(metrics.averageConfidence, count) - 3
        ).toFixed(2),
        convenience: (
          this.calculateAverage(metrics.averageConvenience, count) - 3
        ).toFixed(2),
        trust: (this.calculateAverage(metrics.averageBrand, count) - 3).toFixed(
          2,
        ),
        value: (this.calculateAverage(metrics.averageValue, count) - 3).toFixed(
          2,
        ),
        share_of_buy: shareOfBuy,
        count,
      };
    });
  }

  private calculateAverage(sum: number, count: number): number {
    return count > 0 ? Number((sum / count).toFixed(2)) : 0;
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

      // First try to get survey responses
      let responses = await this.supabaseService.findMany<
        ResponseSurvey & { test_id: string; product_id: string }
      >(TableName.RESPONSES_SURVEYS, {
        test_id: testId,
        product_id: variation.product_id,
      });

      // If no survey responses, try to get comparison responses (Walmart or Amazon)
      if (!responses?.length) {
        responses = await this.getComparisonResponses(testId, variation.product_id) as any;
      }

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
    const test = await this.testsService.getRawDataByTestId(testId);
    const demographics = await this.testsService.getTestDemographics(testId);
    const variantSummaries = await this.testsService.getTestSummaries(testId);
    const competitorsInsights =
      await this.testsService.getCompetitorInsights(testId);

    return {
      test_metadata: {
        test_id: test.id,
        objective: test.objective,
        test_type: 'Variant-Based',
        sample_size: demographics?.tester_count || 0,
        created_date: test.createdAt,
        search_term: test.searchTerm,
      },
      audience: {
        demographics: {
          age_ranges: demographics?.age_ranges || [],
          gender: demographics?.genders || [],
          location: demographics?.locations || [],
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

  public async getAiInsights(testId: string) {
    try {
      this.logger.log(`Retrieving AI insights for test ${testId}`);

      const aiInsights = await this.supabaseService.findMany<AiInsight>(
        TableName.AI_INSIGHTS,
        { test_id: testId },
      );

      return aiInsights;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve AI insights for test ${testId}:`,
        error,
      );
      throw error;
    }
  }

  private async getInsightsDataForVariant(testId: string, variantType: string) {
    const test = await this.testsService.getRawDataByTestId(testId);
    const demographics = await this.testsService.getTestDemographics(testId);
    const variantSummaries = await this.testsService.getTestSummaries(testId);
    const competitorsInsights =
      await this.testsService.getCompetitorInsights(testId);

    // Get the specific variant data
    const variantInfo = test.variations[variantType];
    if (!variantInfo) {
      throw new NotFoundException(
        `Variant ${variantType} not found for test ${testId}`,
      );
    }

    const variantSummary = variantSummaries.find(
      ({ variant_type }) => variant_type === variantType,
    );

    // Filter competitor insights to only show data for the current variant
    const filteredCompetitorsInsights = Object.values(competitorsInsights).map(
      (insights) => ({
        name: insights.title,
        price: insights.price,
        // Only include data for the current variant
        current_variant_performance: insights.variants[variantType] || null,
      }),
    );

    return {
      test_metadata: {
        test_id: test.id,
        objective: test.objective,
        test_type: 'Variant-Based',
        sample_size: demographics?.tester_count || 0,
        created_date: test.createdAt,
        search_term: test.searchTerm,
        current_variant: variantType.toUpperCase(),
        analysis_note: `This analysis focuses exclusively on Variant ${variantType.toUpperCase()} (${variantInfo.title} at $${variantInfo.price}). Do not compare to other variants.`,
      },
      audience: {
        demographics: {
          age_ranges: demographics?.age_ranges || [],
          gender: demographics?.genders || [],
          location: demographics?.locations || [],
        },
      },
      current_variant: {
        id: variantType,
        title: variantInfo.title,
        price: variantInfo.price,
        click_share: variantSummary?.share_of_click,
        buy_share: variantSummary?.share_of_buy,
        value_score: variantSummary?.value_score,
      },
      // Include all variants for context but clearly mark the current one
      all_variants: Object.entries(test.variations).reduce(
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
              is_current_variant: variantName === variantType,
            });
          }

          return acc;
        },
        [],
      ),
      // Only include competitor data for the current variant
      competitors_detailed: filteredCompetitorsInsights,
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
    const individualValues = surveys.map((survey) => survey.value);

    // Calcular el promedio total de todos los valores individuales
    const totalAverage = calculateAverageScore(individualValues);

    return totalAverage;
  }

  private generateVariantSummary(
    testName: string,
    productTitle: string,
    testId: string,
    variant: string,
    surveysAmount: number,
    shareOfClicks: number,
    totalAverage: number,
    totalSelectionsForVariant: number,
  ) {
    // Safety check to prevent division by zero
    if (totalSelectionsForVariant === 0) {
      this.logger.warn(`⚠️  WARNING: totalSelectionsForVariant is 0 for variant ${variant}. Cannot calculate share of buy.`);
      return {
        name: testName,
        productTitle: productTitle,
        testid: testId,
        variant: variant,
        shareOfClicks: shareOfClicks,
        shareOfBuy: '0.0',
        valueScore: totalAverage.toFixed(1),
        surveysAmount: surveysAmount,
        totalSelections: totalSelectionsForVariant
      };
    }
    
    const shareOfBuy = ((surveysAmount / totalSelectionsForVariant) * 100).toFixed(1);

    return {
      name: testName,
      productTitle: productTitle,
      testid: testId,
      variant,
      valuescore: Number(totalAverage.toFixed(1)),
      shareOfBuy: Number(shareOfBuy),
      shareOfClicks: Number(shareOfClicks.toFixed(1)),
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

  private async generateAiInsights(
    testId: string,
    testObjective: TestObjective,
  ) {
    const formattedData = await this.getInsightsData(testId);

    // Generate comment summary for all variants in one call
    let commentSummary: string | null = null;

    try {
      commentSummary = await this.generateCommentSummary(testId);
    } catch (error) {
      this.logger.warn(
        `Failed to generate comment summary for test ${testId}:`,
        error,
      );
    }

    // First call: Generate initial insights
    let unformattedInsights: string;
    try {
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(testObjective);

      if (provider !== 'openai') {
        throw new BadRequestException(
          `Unsupported LLM provider: ${provider}. Only 'openai' is supported.`,
        );
      }

      // Format messages for OpenAI
      const openAiMessages = messages.map<ChatCompletionMessageParam>((msg) => {
        // Concatenate all text blocks in content
        const content = msg.content.map((block) => block.value).join('\n\n');

        return {
          role: msg.role,
          content,
        } as ChatCompletionMessageParam;
      });

      unformattedInsights = await this.openAiService.createChatCompletion(
        [
          ...openAiMessages,
          {
            role: 'user',
            content: `Here is the test data to analyze:\n\n${JSON.stringify(formattedData)}`,
          },
        ],
        { model },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate initial insights for test ${testId}:`,
        error,
      );
      throw new BadRequestException(
        `Failed to generate initial insights: ${error.message}`,
      );
    }

    // Second call: Edit and fact-check the insights
    let editedInsights: string;
    try {
      const {
        config: { provider: editorProvider, model: editorModel },
        messages: editorMessages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '0e1ad14a-b33b-4068-9924-201a6913eb59',
      );

      if (editorProvider !== 'openai') {
        throw new BadRequestException(
          `Unsupported LLM provider: ${editorProvider}. Only 'openai' is supported.`,
        );
      }

      // Format editor messages for OpenAI
      const editorOpenAiMessages = editorMessages.map<ChatCompletionMessageParam>((msg) => {
        // Replace {data} placeholder with the initial insights and test data
        const content = msg.content
          .map((block) => {
            if (block && typeof block.value === 'string' && block.value.includes('{data}')) {
              return block.value.replace(
                '{data}',
                `Initial Analysis:\n\n${unformattedInsights}\n\n///DATA///\n\n${JSON.stringify(formattedData, null, 2)}`
              );
            }
            return block && typeof block.value === 'string' ? block.value : '';
          })
          .join('\n\n');

        return {
          role: msg.role,
          content,
        } as ChatCompletionMessageParam;
      });

      editedInsights = await this.openAiService.createChatCompletion(
        editorOpenAiMessages,
        { model: editorModel },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to edit insights for test ${testId}, using original insights:`,
        error,
      );
      // Fallback to original insights if editing fails
      editedInsights = unformattedInsights;
    }

    try {
      const formattedResult = {
        ...insightsFormatter(editedInsights),
        comment_summary: commentSummary,
      };
      return formattedResult;
    } catch (formatError) {
      this.logger.error(
        `Failed to format insights for test ${testId}:`,
        formatError,
      );
      
      // Fallback to a basic format if the formatter fails
      const fallbackResult = {
        comparison_between_variants: editedInsights,
        purchase_drivers: '',
        competitive_insights: '',
        recommendations: '',
        comment_summary: commentSummary,
      };
      return fallbackResult;
    }
  }

  private async calculateShareOfClicks(
    testId: string,
    variantProductId: string,
  ) {
    // Get ALL clicks for this test (main products + competitors)
    const allClicksFromTest = await this.supabaseService.findMany<Event>(
      TableName.EVENTS,
      { 'metadata->>test_id': testId },
    );

    // Count total clicks (main products + competitors)
    const totalClicks = allClicksFromTest.length;
    
    // Count clicks for this specific variant product only
    const variantClicks = allClicksFromTest.filter(
      (click) => click.metadata['product_id'] === variantProductId,
    ).length;

    this.logger.log(`📊 Share of clicks calculation: ${variantClicks}/${totalClicks} = ${totalClicks > 0 ? (variantClicks / totalClicks) * 100 : 0}%`);
    
    return totalClicks > 0 ? (variantClicks / totalClicks) * 100 : 0;
  }

  private async generateCommentSummary(testId: string) {
    try {
      // Format all variants' survey responses
      const variantsData = await this.formatAllVariantsSurveyResponses(testId);

      // Generate initial draft
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '225e999e-3bba-4ca5-99a1-34805f9c8ac7',
      );

      if (provider !== 'openai') {
        throw new BadRequestException(
          `Unsupported LLM provider: ${provider}. Only 'openai' is supported.`,
        );
      }

      // Format messages for OpenAI
      const openAiMessages = messages.map<ChatCompletionMessageParam>((msg) => {
        // Replace {data} placeholder with all variants data
        const content = msg.content
          .map((block) => {
            if (block.value.includes('{data}')) {
              return block.value.replace(
                '{data}',
                JSON.stringify(variantsData, null, 2),
              );
            }

            return block.value;
          })
          .join('\n\n');

        return {
          role: msg.role,
          content,
        } as ChatCompletionMessageParam;
      });

      // Generate the initial draft using OpenAI and return it directly
      return await this.openAiService.createChatCompletion(
        openAiMessages,
        { model },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate comment summary for test ${testId}:`,
        error,
      );

      throw error;
    }
  }

  private async generateCommentSummaryForVariant(
    testId: string,
    variantType: string,
  ) {
    try {
      // Format survey responses for this specific variant
      const variantData = await this.formatVariantSurveyResponses(
        testId,
        variantType,
      );

      // Generate initial draft
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '225e999e-3bba-4ca5-99a1-34805f9c8ac7',
      );

      if (provider !== 'openai') {
        throw new BadRequestException(
          `Unsupported LLM provider: ${provider}. Only 'openai' is supported.`,
        );
      }

      // Format messages for OpenAI
      const openAiMessages = messages.map<ChatCompletionMessageParam>((msg) => {
        // Replace {data} placeholder with variant-specific data
        const content = msg.content
          .map((block) => {
            if (block.value.includes('{data}')) {
              return block.value.replace(
                '{data}',
                JSON.stringify(
                  { [`Variant ${variantType.toUpperCase()}`]: variantData },
                  null,
                  2,
                ),
              );
            }

            return block.value;
          })
          .join('\n\n');

        return {
          role: msg.role,
          content,
        } as ChatCompletionMessageParam;
      });

      // Generate the initial draft using OpenAI for this specific variant and return it directly
      return await this.openAiService.createChatCompletion(
        openAiMessages,
        { model },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate comment summary for variant ${variantType} in test ${testId}:`,
        error,
      );

      throw error;
    }
  }

  private async formatAllVariantsSurveyResponses(testId: string) {
    // Get all test variations
    const testVariations = await this.testsService.getTestVariations(testId);

    const variantsData = {};

    // Process each variant
    for (const variation of testVariations) {
      // Get survey responses for this variant
      const surveyResponses = await this.productsService.getProductSurveys(
        variation.product_id,
        testId,
      );

      // Get comparison responses - try Walmart first, then Amazon
      let comparisonResponses = await this.supabaseService.findMany<ResponseComparison>(
        TableName.RESPONSES_COMPARISONS_WALMART,
        {
          test_id: testId,
          product_id: variation.product_id,
        },
      );

      // If no Walmart responses, try Amazon
      if (comparisonResponses.length === 0) {
        comparisonResponses = await this.supabaseService.findMany<ResponseComparison>(
          TableName.RESPONSES_COMPARISONS,
          {
            test_id: testId,
            product_id: variation.product_id,
          },
        );
      }

      // Format responses for this variant
      const formattedData = surveyResponsesForSummaryFormatter(
        surveyResponses,
        comparisonResponses,
      );

      variantsData[`Variant ${variation.variation_type}`] = formattedData;
    }

    return variantsData;
  }

  private async formatVariantSurveyResponses(
    testId: string,
    variantType: string,
  ) {
    // Get the specific test variation
    const testVariations = await this.testsService.getTestVariations(testId);
    const variation = testVariations.find(
      (v) => v.variation_type === variantType,
    );

    if (!variation) {
      throw new NotFoundException(
        `Variant ${variantType} not found for test ${testId}`,
      );
    }

    // Get survey responses for this variant
    const surveyResponses = await this.productsService.getProductSurveys(
      variation.product_id,
      testId,
    );

    // Get comparison responses
    const comparisonResponses =
      await this.supabaseService.findMany<ResponseComparison>(
        TableName.RESPONSES_COMPARISONS,
        {
          test_id: testId,
          product_id: variation.product_id,
        },
      );

    // Format responses for this variant
    return surveyResponsesForSummaryFormatter(
      surveyResponses,
      comparisonResponses,
    );
  }

  private async generateCrossVariantInsights(
    testId: string,
    testObjective: TestObjective,
  ) {
    // Use full test data to generate cross-variant purchase drivers
    const formattedData = await this.getInsightsData(testId);

    // Generate comment summary for all variants
    let commentSummary: string | null = null;

    try {
      commentSummary = await this.generateCommentSummary(testId);
    } catch (error) {
      this.logger.warn(
        `Failed to generate comment summary for test ${testId}:`,
        error,
      );
    }

    const {
      config: { provider, model },
      messages,
    } = await this.adalineService.getPromptDeployment(testObjective);

    if (provider !== 'openai') {
      throw new BadRequestException(
        `Unsupported LLM provider: ${provider}. Only 'openai' is supported.`,
      );
    }

    // Format messages for OpenAI
    const openAiMessages = messages.map<ChatCompletionMessageParam>((msg) => {
      // Concatenate all text blocks in content
      const content = msg.content.map((block) => block.value).join('\n\n');

      return {
        role: msg.role,
        content,
      } as ChatCompletionMessageParam;
    });

    const unformattedInsights = await this.openAiService.createChatCompletion(
      [
        ...openAiMessages,
        {
          role: 'user',
          content: `Here is the test data to analyze:\n\n${JSON.stringify(formattedData)}`,
        },
      ],
      { model },
    );

    try {
      const formattedResult = {
        ...insightsFormatter(unformattedInsights),
        comment_summary: commentSummary,
      };
      return formattedResult;
    } catch (formatError) {
      this.logger.error(
        `Failed to format cross-variant insights for test ${testId}:`,
        formatError,
      );
      
      // Fallback to a basic format if the formatter fails
      const fallbackResult = {
        comparison_between_variants: unformattedInsights,
        purchase_drivers: '',
        competitive_insights: '',
        recommendations: '',
        comment_summary: commentSummary,
      };
      return fallbackResult;
    }
  }

  private async generateCompetitiveInsightsForVariant(
    testId: string,
    testObjective: TestObjective,
    variantType: string,
  ) {
    // Use variant-specific data for competitive insights
    const formattedData = await this.getInsightsDataForVariant(testId, variantType);

    const {
      config: { provider, model },
      messages,
    } = await this.adalineService.getPromptDeployment(testObjective);

    if (provider !== 'openai') {
      throw new BadRequestException(
        `Unsupported LLM provider: ${provider}. Only 'openai' is supported.`,
      );
    }

    // Format messages for OpenAI
    const openAiMessages = messages.map<ChatCompletionMessageParam>((msg) => {
      // Concatenate all text blocks in content
      const content = msg.content.map((block) => block.value).join('\n\n');

      return {
        role: msg.role,
        content,
      } as ChatCompletionMessageParam;
    });

    const unformattedInsights = await this.openAiService.createChatCompletion(
      [
        ...openAiMessages,
        {
          role: 'user',
          content: `Here is the test data to analyze:\n\n${JSON.stringify(formattedData)}`,
        },
      ],
      { model },
    );

    try {
      const formattedResult = insightsFormatter(unformattedInsights);
      return {
        competitive_insights: formattedResult.competitive_insights,
      };
    } catch (formatError) {
      this.logger.error(
        `Failed to format competitive insights for variant ${variantType} in test ${testId}:`,
        formatError,
      );
      
      // Fallback to a basic format if the formatter fails
      return {
        competitive_insights: unformattedInsights,
      };
    }
  }

  public async updateInsightById(
    insightId: number,
    updateData: {
      comparison_between_variants?: string;
      purchase_drivers?: string;
      competitive_insights?: string;
      competitive_insights_a?: string;
      competitive_insights_b?: string;
      competitive_insights_c?: string;
      recommendations?: string;
      comment_summary?: string;
      sendEmail?: boolean;
      edited?: boolean;
    },
  ) {
    try {
      this.logger.log(`Updating insight with ID ${insightId}`);

      // First, check if the insight exists
      const existingInsight = await this.supabaseService.findOne<AiInsight>(
        TableName.AI_INSIGHTS,
        { id: insightId },
      );

      if (!existingInsight) {
        throw new NotFoundException(`Insight with ID ${insightId} not found`);
      }

      // Strip undefined keys so we only update what the client actually sent
      const payload = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined),
      ) as Partial<typeof updateData>;

      // Update only the provided fields
      const updatedInsight = await this.supabaseService.update<AiInsight>(
        TableName.AI_INSIGHTS,
        payload,
        [{ key: 'id', value: insightId }],
      );

      if (!updatedInsight) {
        throw new NotFoundException(`Insight with ID ${insightId} not found`);
      }

      this.logger.log(`Successfully updated insight with ID ${insightId}`);
      return updatedInsight; // Return the updated insight
    } catch (error) {
      this.logger.error(`Failed to update insight with ID ${insightId}:`, error);
      throw error;
    }
  }

  private combineVariantInsights(
    crossVariantInsights: any,
    variantInsights: Record<string, any>,
    testVariations: TestVariation[],
  ) {
    // Start with cross-variant insights (purchase drivers, comparison, recommendations)
    const combinedInsights: any = {
      comparison_between_variants: crossVariantInsights.comparison_between_variants || '',
      purchase_drivers: crossVariantInsights.purchase_drivers || '',
      recommendations: crossVariantInsights.recommendations || '',
      comment_summary: crossVariantInsights.comment_summary || '',
      competitive_insights: crossVariantInsights.competitive_insights || '',
    };

    // Add variant-specific competitive insights
    testVariations.forEach((variation) => {
      const variantKey = `competitive_insights_${variation.variation_type}`;
      const variantInsight = variantInsights[variation.variation_type];
      
      if (variantInsight && variantInsight.competitive_insights) {
        combinedInsights[variantKey] = variantInsight.competitive_insights;
      } else {
        combinedInsights[variantKey] = null;
      }
    });

    return combinedInsights;
  }
}
