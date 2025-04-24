import { Injectable } from '@nestjs/common';
import { TestsService } from 'tests/tests.service';

@Injectable()
export class InsightsService {
  constructor(private readonly testsService: TestsService) {}

  public async getInsights(testId: string) {
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
}
