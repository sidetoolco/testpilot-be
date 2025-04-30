export function insightsFormatter(unformattedInsights: string) {
  const regex =
    /## RESULTS OVERVIEW\s*([\s\S]*?)## PURCHASE DRIVERS \(BY VARIANT\)\s*([\s\S]*?)## COMPETITIVE INSIGHTS\s*([\s\S]*?)## RECOMMENDATIONS\s*([\s\S]*)/;
  const match = unformattedInsights.match(regex);

  if (!match) {
    throw new Error('Input text does not match expected format.');
  }

  const [
    _,
    comparison_between_variants,
    purchase_drivers,
    competitive_insights,
    recommendations,
  ] = match;

  return {
    comparison_between_variants: comparison_between_variants.trim(),
    purchase_drivers: purchase_drivers.trim(),
    competitive_insights: competitive_insights.trim(),
    recommendations: recommendations.trim(),
  };
}
