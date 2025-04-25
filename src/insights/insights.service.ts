import { Injectable, Logger } from '@nestjs/common';
import { TableName } from 'lib/enums';
import { calculateAverageScore } from 'lib/helpers';
import { AiInsight, ResponseSurvey } from 'lib/interfaces/entities.interface';
import { OpenAiService } from 'open-ai/open-ai.service';
import { ProductsService } from 'products/products.service';
import { ProlificService } from 'prolific/prolific.service';
import { SupabaseService } from 'supabase/supabase.service';
import { TestsService } from 'tests/tests.service';
import { GENERATE_INSIGHTS_PROMPT } from './constants';

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
      const aiInsights = await this.generateAiInsights(testId);
      return await this.supabaseService.upsert<AiInsight>(
        TableName.AI_INSIGHTS,
        {
          test_id: testId,
          recommendations: aiInsights,
        },
        'test_id',
      );
    } catch (error) {
      this.logger.error('Failed to generate AI insights:', error);
      console.error(error);
      throw error;
    }
  }

  public async generateStudyInsights(studyId: string) {
    this.logger.log(`Generating insights for study ${studyId}`);

    try {
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
      const summaries = [];

      for (const variant of testVariations) {
        const chosenTimes = await this.testsService.getTestTimesByProductId(
          variant.product_id,
        );
        const surveys = await this.productsService.getProductSurveys(
          variant.product_id,
          testId,
        );
        const totalClicksPerVariant =
          await this.testsService.getTestTimesByTestVariation(
            testId,
            variant.variation_type,
          );

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

        summaries.push(savedSummary);
      }

      return summaries;
    } catch (error) {
      this.logger.error(
        `Failed to generate insights for study ${studyId}:`,
        error,
      );

      throw error;
    }
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

  private saveInsights(
    testId: string,
    shareOfBuy: number,
    shareOfClick: number,
    valueScore: number,
    variantType: string,
    productId: string,
  ) {
    return this.supabaseService.insert(TableName.TEST_SUMMARY, {
      test_id: testId,
      share_of_buy: shareOfBuy,
      share_of_click: shareOfClick,
      value_score: valueScore,
      variant_type: variantType,
      product_id: productId,
      win: false,
    });
  }

  private async generateAiInsights(testId: string) {
    const formattedData = await this.getInsightsData(testId);

    return this.openAiService.createChatCompletion([
      {
        role: 'system',
        content: GENERATE_INSIGHTS_PROMPT,
      },
      {
        role: 'user',
        content: `Here is the test data to analyze:\n\n${formattedData}`,
      },
    ]);
  }
}
