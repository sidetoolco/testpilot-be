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

  public async saveAiInsights(testId: string) {
    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== STARTING AI INSIGHTS GENERATION FOR TEST ${testId} =====`);
      this.logger.log(`Generating AI insights for test ${testId}`);
      const { objective } = await this.testsService.getTestById(testId);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Test objective: ${objective}`);
      
      const testVariations = await this.testsService.getTestVariations(testId);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Found ${testVariations.length} variants for test ${testId}`);
      testVariations.forEach(v => this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant: ${v.variation_type}`));

      const results = [];

      // Generate AI insights for each variant
      for (const variation of testVariations) {
        try {
          this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== PROCESSING VARIANT ${variation.variation_type} =====`);
          this.logger.log(
            `Generating AI insights for variant ${variation.variation_type}`,
          );
          const aiInsights = await this.generateAiInsightsForVariant(
            testId,
            objective,
            variation.variation_type,
          );

          this.logger.log(`[EDITOR/FORMATTER DEBUG] Saving AI insights for variant ${variation.variation_type}`);
          const savedInsight = await this.supabaseService.upsert<AiInsight>(
            TableName.AI_INSIGHTS,
            {
              test_id: testId,
              variant_type: variation.variation_type,
              ...aiInsights,
            },
            'test_id,variant_type',
          );

          this.logger.log(`[EDITOR/FORMATTER DEBUG] Successfully saved insights for variant ${variation.variation_type}`);
          results.push(savedInsight);
        } catch (error) {
          this.logger.error(
            `[EDITOR/FORMATTER DEBUG] Failed to generate AI insights for variant ${variation.variation_type}:`,
            error,
          );
          // Continue with other variants even if one fails
        }
      }

      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== COMPLETED AI INSIGHTS GENERATION FOR TEST ${testId} =====`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Total results: ${results.length}`);
      return results;
    } catch (error) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to generate or save AI insights for test ${testId}:`,
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
      const shopperCount = test.demographics.testerCount;

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
      const summary = this.generateVariantSummary(
        test.name,
        variantChoosen.product.title,
        testId,
        variantChoosen.variation_type,
        surveys.length,
        await this.calculateShareOfClicks(testId, variantChoosen.product_id),
        totalAverage,
        shopperCount,
      );

      const [variantPurchaseDrivers, variantCompetitiveInsights, savedSummary] =
        await Promise.all([
          this.purchaseDrivers(testId, variation),
          this.competitiveInsights(variantChoosen, testId, shopperCount),
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
    variation: TestVariation,
    testId: string,
    shopperCount: number,
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
        shopperCount,
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
    shopperCount: number,
  ) {
    // Calculate total selections for this specific variant
    const totalSelectionsForVariant = Object.values(groupedData).reduce(
      (total: number, metrics: any) => total + metrics.count,
      0
    );

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

      // FIX: Calculate share of buy based on total selections for this variant, not total shopper count
      // This ensures that share of buy percentages sum to ~100% per variant
      const shareOfBuy = totalSelectionsForVariant > 0 
        ? ((count / totalSelectionsForVariant) * 100).toFixed(2)
        : '0.00';

      return {
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
        sample_size: demographics.tester_count,
        created_date: test.createdAt,
        search_term: test.searchTerm,
        current_variant: variantType.toUpperCase(),
        analysis_note: `This analysis focuses exclusively on Variant ${variantType.toUpperCase()} (${variantInfo.title} at $${variantInfo.price}). Do not compare to other variants.`,
      },
      audience: {
        demographics: {
          age_ranges: demographics.age_ranges,
          gender: demographics.genders,
          location: demographics.locations,
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
    shopperCount: number,
  ) {
    const shareOfBuy = ((surveysAmount / shopperCount) * 100).toFixed(1);

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
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Starting generateAiInsights for test ${testId}`);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Test objective: ${testObjective}`);
    
    const formattedData = await this.getInsightsData(testId);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Formatted data retrieved for test ${testId}`);

    // Generate comment summary for all variants in one call
    let commentSummary: string | null = null;

    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Generating comment summary for test ${testId}`);
      commentSummary = await this.generateCommentSummary(testId);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Comment summary generated successfully for test ${testId}`);
    } catch (error) {
      this.logger.warn(
        `[EDITOR/FORMATTER DEBUG] Failed to generate comment summary for test ${testId}:`,
        error,
      );
    }

    // First call: Generate initial insights
    let unformattedInsights: string;
    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Getting prompt deployment for test ${testId}`);
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(testObjective);

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Prompt deployment config - provider: ${provider}, model: ${model}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Number of messages: ${messages.length}`);

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

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for initial insights for test ${testId}`);
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
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial insights generated for test ${testId}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial insights length: ${unformattedInsights.length} characters`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial insights preview: ${unformattedInsights.substring(0, 200)}...`);
    } catch (error) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to generate initial insights for test ${testId}:`,
        error,
      );
      throw new BadRequestException(
        `Failed to generate initial insights: ${error.message}`,
      );
    }

    // Second call: Edit and fact-check the insights
    let editedInsights: string;
    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Getting editor prompt deployment for test ${testId}`);
      const {
        config: { provider: editorProvider, model: editorModel },
        messages: editorMessages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '0e1ad14a-b33b-4068-9924-201a6913eb59',
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Editor deployment config - provider: ${editorProvider}, model: ${editorModel}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Number of editor messages: ${editorMessages.length}`);

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
              this.logger.log(`[EDITOR/FORMATTER DEBUG] Found {data} placeholder, replacing with insights and data`);
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

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for edited insights for test ${testId}`);
      editedInsights = await this.openAiService.createChatCompletion(
        editorOpenAiMessages,
        { model: editorModel },
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited insights generated for test ${testId}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited insights length: ${editedInsights.length} characters`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited insights preview: ${editedInsights.substring(0, 200)}...`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Editor prompt response for test ${testId}: ${editedInsights.substring(0, 500)}...`);
    } catch (error) {
      this.logger.warn(
        `[EDITOR/FORMATTER DEBUG] Failed to edit insights for test ${testId}, using original insights:`,
        error,
      );
      // Fallback to original insights if editing fails
      editedInsights = unformattedInsights;
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Using fallback insights for test ${testId}`);
    }

    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Attempting to format insights for test ${testId}`);
      const formattedResult = {
        ...insightsFormatter(editedInsights),
        comment_summary: commentSummary,
      };
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Insights formatted successfully for test ${testId}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Formatted result keys: ${Object.keys(formattedResult).join(', ')}`);
      return formattedResult;
    } catch (formatError) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to format insights for test ${testId}:`,
        formatError,
      );
      this.logger.error(`[EDITOR/FORMATTER DEBUG] Raw insights text: ${editedInsights.substring(0, 1000)}`);
      
      // Fallback to a basic format if the formatter fails
      const fallbackResult = {
        comparison_between_variants: editedInsights,
        purchase_drivers: '',
        competitive_insights: '',
        recommendations: '',
        comment_summary: commentSummary,
      };
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Using fallback format for test ${testId}`);
      return fallbackResult;
    }
  }

  private async generateAiInsightsForVariant(
    testId: string,
    testObjective: TestObjective,
    variantType: string,
  ) {
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Starting generateAiInsightsForVariant for test ${testId}, variant ${variantType}`);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Test objective: ${testObjective}`);
    
    const formattedData = await this.getInsightsDataForVariant(
      testId,
      variantType,
    );
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant-specific formatted data retrieved for test ${testId}, variant ${variantType}`);

    // Generate comment summary for this specific variant
    let commentSummary: string | null = null;

    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Generating comment summary for variant ${variantType} in test ${testId}`);
      commentSummary = await this.generateCommentSummaryForVariant(
        testId,
        variantType,
      );
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Comment summary generated successfully for variant ${variantType} in test ${testId}`);
    } catch (error) {
      this.logger.warn(
        `[EDITOR/FORMATTER DEBUG] Failed to generate comment summary for variant ${variantType} in test ${testId}:`,
        error,
      );
    }

    this.logger.log(`[EDITOR/FORMATTER DEBUG] Getting prompt deployment for variant ${variantType} in test ${testId}`);
    const {
      config: { provider, model },
      messages,
    } = await this.adalineService.getPromptDeployment(testObjective);

    this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant prompt deployment config - provider: ${provider}, model: ${model}`);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Number of variant messages: ${messages.length}`);

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

    this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for variant insights for test ${testId}, variant ${variantType}`);
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

    this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant insights generated for test ${testId}, variant ${variantType}`);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant insights length: ${unformattedInsights.length} characters`);
    this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant insights preview: ${unformattedInsights.substring(0, 200)}...`);

    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Attempting to format variant insights for test ${testId}, variant ${variantType}`);
      const formattedResult = {
        ...insightsFormatter(unformattedInsights),
        comment_summary: commentSummary,
      };
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant insights formatted successfully for test ${testId}, variant ${variantType}`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant formatted result keys: ${Object.keys(formattedResult).join(', ')}`);
      return formattedResult;
    } catch (formatError) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to format variant insights for test ${testId}, variant ${variantType}:`,
        formatError,
      );
      this.logger.error(`[EDITOR/FORMATTER DEBUG] Raw variant insights text: ${unformattedInsights.substring(0, 1000)}`);
      
      // Fallback to a basic format if the formatter fails
      const fallbackResult = {
        comparison_between_variants: unformattedInsights,
        purchase_drivers: '',
        competitive_insights: '',
        recommendations: '',
        comment_summary: commentSummary,
      };
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Using fallback format for variant ${variantType} in test ${testId}`);
      return fallbackResult;
    }
  }

  private async calculateShareOfClicks(
    testId: string,
    variantProductId: string,
  ) {
    const allClicksFromTest = await this.supabaseService.findMany<Event>(
      TableName.EVENTS,
      { 'metadata->>test_id': testId },
    );

    const totalClicks = allClicksFromTest.length;
    const variantClicks = allClicksFromTest.filter(
      (click) => click.metadata['product_id'] === variantProductId,
    ).length;

    return totalClicks > 0 ? (variantClicks / totalClicks) * 100 : 0;
  }

  private async generateCommentSummary(testId: string) {
    try {
      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== STARTING COMMENT SUMMARY GENERATION FOR TEST ${testId} =====`);

      // Format all variants' survey responses
      const variantsData = await this.formatAllVariantsSurveyResponses(testId);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Formatted variants data for comment summary`);

      // STEP A: Generate initial draft
      this.logger.log(`[EDITOR/FORMATTER DEBUG] STEP A: Generating initial comment summary draft for test ${testId}`);
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '225e999e-3bba-4ca5-99a1-34805f9c8ac7',
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Comment summary deployment config - provider: ${provider}, model: ${model}`);

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
              this.logger.log(`[EDITOR/FORMATTER DEBUG] Found {data} placeholder in comment summary prompt`);
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

      // Generate the initial draft using OpenAI
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for initial comment summary draft`);
      const initialDraft = await this.openAiService.createChatCompletion(
        openAiMessages,
        { model },
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial comment summary draft generated`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial draft length: ${initialDraft.length} characters`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial draft preview: ${initialDraft.substring(0, 200)}...`);

      // STEP B: Edit the draft with Allan's style guide
      this.logger.log(`[EDITOR/FORMATTER DEBUG] STEP B: Editing comment summary with Allan's style guide for test ${testId}`);
      let editedSummary: string;
      try {
        const {
          config: { provider: editorProvider, model: editorModel },
          messages: editorMessages,
        } = await this.adalineService.getPromptDeployment(
          undefined,
          '0e1ad14a-b33b-4068-9924-201a6913eb59', // Editor prompt deployment
        );

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Comment summary editor deployment config - provider: ${editorProvider}, model: ${editorModel}`);

        if (editorProvider !== 'openai') {
          throw new BadRequestException(
            `Unsupported LLM provider: ${editorProvider}. Only 'openai' is supported.`,
          );
        }

        // Format editor messages for OpenAI
        const editorOpenAiMessages = editorMessages.map<ChatCompletionMessageParam>((msg) => {
          // Replace {data} placeholder with the initial draft and variants data
          const content = msg.content
            .map((block) => {
              if (block && typeof block.value === 'string' && block.value.includes('{data}')) {
                this.logger.log(`[EDITOR/FORMATTER DEBUG] Found {data} placeholder in comment summary editor prompt`);
                return block.value.replace(
                  '{data}',
                  `Initial Comment Summary Draft:\n\n${initialDraft}\n\n///VARIANTS DATA///\n\n${JSON.stringify(variantsData, null, 2)}`
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

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for edited comment summary`);
        editedSummary = await this.openAiService.createChatCompletion(
          editorOpenAiMessages,
          { model: editorModel },
        );

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Comment summary edited successfully`);
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited summary length: ${editedSummary.length} characters`);
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited summary preview: ${editedSummary.substring(0, 200)}...`);

      } catch (error) {
        this.logger.warn(
          `[EDITOR/FORMATTER DEBUG] Failed to edit comment summary for test ${testId}, using original draft:`,
          error,
        );
        // Fallback to original draft if editing fails
        editedSummary = initialDraft;
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Using fallback comment summary for test ${testId}`);
      }

      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== COMPLETED COMMENT SUMMARY GENERATION FOR TEST ${testId} =====`);
      return editedSummary;
    } catch (error) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to generate comment summary for test ${testId}:`,
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
      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== STARTING COMMENT SUMMARY GENERATION FOR VARIANT ${variantType} IN TEST ${testId} =====`);

      // Format survey responses for this specific variant
      const variantData = await this.formatVariantSurveyResponses(
        testId,
        variantType,
      );
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Formatted variant data for comment summary`);

      // STEP A: Generate initial draft
      this.logger.log(`[EDITOR/FORMATTER DEBUG] STEP A: Generating initial comment summary draft for variant ${variantType} in test ${testId}`);
      const {
        config: { provider, model },
        messages,
      } = await this.adalineService.getPromptDeployment(
        undefined,
        '225e999e-3bba-4ca5-99a1-34805f9c8ac7',
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant comment summary deployment config - provider: ${provider}, model: ${model}`);

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
              this.logger.log(`[EDITOR/FORMATTER DEBUG] Found {data} placeholder in variant comment summary prompt`);
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

      // Generate the initial draft using OpenAI for this specific variant
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for initial variant comment summary draft`);
      const initialDraft = await this.openAiService.createChatCompletion(
        openAiMessages,
        { model },
      );

      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial variant comment summary draft generated`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial variant draft length: ${initialDraft.length} characters`);
      this.logger.log(`[EDITOR/FORMATTER DEBUG] Initial variant draft preview: ${initialDraft.substring(0, 200)}...`);

      // STEP B: Edit the draft with Allan's style guide
      this.logger.log(`[EDITOR/FORMATTER DEBUG] STEP B: Editing variant comment summary with Allan's style guide for variant ${variantType} in test ${testId}`);
      let editedSummary: string;
      try {
        const {
          config: { provider: editorProvider, model: editorModel },
          messages: editorMessages,
        } = await this.adalineService.getPromptDeployment(
          undefined,
          '0e1ad14a-b33b-4068-9924-201a6913eb59', // Editor prompt deployment
        );

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant comment summary editor deployment config - provider: ${editorProvider}, model: ${editorModel}`);

        if (editorProvider !== 'openai') {
          throw new BadRequestException(
            `Unsupported LLM provider: ${editorProvider}. Only 'openai' is supported.`,
          );
        }

        // Format editor messages for OpenAI
        const editorOpenAiMessages = editorMessages.map<ChatCompletionMessageParam>((msg) => {
          // Replace {data} placeholder with the initial draft and variant data
          const content = msg.content
            .map((block) => {
              if (block && typeof block.value === 'string' && block.value.includes('{data}')) {
                this.logger.log(`[EDITOR/FORMATTER DEBUG] Found {data} placeholder in variant comment summary editor prompt`);
                return block.value.replace(
                  '{data}',
                  `Initial Comment Summary Draft for Variant ${variantType.toUpperCase()}:\n\n${initialDraft}\n\n///VARIANT DATA///\n\n${JSON.stringify({ [`Variant ${variantType.toUpperCase()}`]: variantData }, null, 2)}`
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

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Calling OpenAI for edited variant comment summary`);
        editedSummary = await this.openAiService.createChatCompletion(
          editorOpenAiMessages,
          { model: editorModel },
        );

        this.logger.log(`[EDITOR/FORMATTER DEBUG] Variant comment summary edited successfully`);
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited variant summary length: ${editedSummary.length} characters`);
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Edited variant summary preview: ${editedSummary.substring(0, 200)}...`);

      } catch (error) {
        this.logger.warn(
          `[EDITOR/FORMATTER DEBUG] Failed to edit variant comment summary for variant ${variantType} in test ${testId}, using original draft:`,
          error,
        );
        // Fallback to original draft if editing fails
        editedSummary = initialDraft;
        this.logger.log(`[EDITOR/FORMATTER DEBUG] Using fallback variant comment summary for variant ${variantType} in test ${testId}`);
      }

      this.logger.log(`[EDITOR/FORMATTER DEBUG] ===== COMPLETED COMMENT SUMMARY GENERATION FOR VARIANT ${variantType} IN TEST ${testId} =====`);
      return editedSummary;
    } catch (error) {
      this.logger.error(
        `[EDITOR/FORMATTER DEBUG] Failed to generate comment summary for variant ${variantType} in test ${testId}:`,
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
}
