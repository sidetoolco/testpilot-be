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

      // Update only the provided fields
      const updatedInsight = await this.supabaseService.update<AiInsight>(
        TableName.AI_INSIGHTS,
        updateData,
        [{ key: 'id', value: insightId }],
      );

      this.logger.log(`Successfully updated insight with ID ${insightId}`);
      return updatedInsight[0]; // Return the updated insight
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
