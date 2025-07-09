export function insightsFormatter(unformattedInsights: string) {
  // More flexible regex that handles different variations of section headers
  const regex =
    /RESULTS OVERVIEW\s*([\s\S]*?)(?:PURCHASE DRIVERS\s*(?:\(BY VARIANT\))?|PURCHASE DRIVERS \(BY VARIANT\))\s*([\s\S]*?)(?:COMPETITIVE INSIGHTS|COMPETITIVE ANALYSIS)\s*([\s\S]*?)(?:RECOMMENDATIONS|RECOMMENDATIONS AND NEXT STEPS)\s*([\s\S]*)/i;
  
  const match = unformattedInsights.match(regex);

  if (!match) {
    // Try a more lenient approach - look for any text that contains the required sections
    const sections = {
      results_overview: '',
      purchase_drivers: '',
      competitive_insights: '',
      recommendations: ''
    };

    // Split by common section headers
    const text = unformattedInsights.toLowerCase();
    
    // Find RESULTS OVERVIEW
    const resultsMatch = unformattedInsights.match(/results overview\s*([\s\S]*?)(?=purchase drivers|competitive insights|recommendations)/i);
    if (resultsMatch) {
      sections.results_overview = resultsMatch[1].trim();
    }

    // Find PURCHASE DRIVERS
    const purchaseMatch = unformattedInsights.match(/purchase drivers[^]*?([\s\S]*?)(?=competitive insights|recommendations)/i);
    if (purchaseMatch) {
      sections.purchase_drivers = purchaseMatch[1].trim();
    }

    // Find COMPETITIVE INSIGHTS
    const competitiveMatch = unformattedInsights.match(/competitive insights[^]*?([\s\S]*?)(?=recommendations)/i);
    if (competitiveMatch) {
      sections.competitive_insights = competitiveMatch[1].trim();
    }

    // Find RECOMMENDATIONS
    const recommendationsMatch = unformattedInsights.match(/recommendations[^]*?([\s\S]*)/i);
    if (recommendationsMatch) {
      sections.recommendations = recommendationsMatch[1].trim();
    }

    // Check if we found at least some sections
    if (sections.results_overview || sections.purchase_drivers || sections.competitive_insights || sections.recommendations) {
      return {
        comparison_between_variants: sections.results_overview,
        purchase_drivers: sections.purchase_drivers,
        competitive_insights: sections.competitive_insights,
        recommendations: sections.recommendations,
      };
    }

    // If still no match, throw a more descriptive error
    throw new Error(`Input text does not match expected format. Expected sections: RESULTS OVERVIEW, PURCHASE DRIVERS, COMPETITIVE INSIGHTS, RECOMMENDATIONS. Received text: ${unformattedInsights.substring(0, 200)}...`);
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
