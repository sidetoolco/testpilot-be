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
    const purchaseMatch = unformattedInsights.match(/purchase drivers\s*([\s\S]*?)(?=competitive insights|recommendations)/i);
    if (purchaseMatch) {
      sections.purchase_drivers = purchaseMatch[1].trim();
    }

    // Find COMPETITIVE INSIGHTS
    const competitiveMatch = unformattedInsights.match(/competitive insights\s*([\s\S]*?)(?=recommendations)/i);
    if (competitiveMatch) {
      sections.competitive_insights = competitiveMatch[1].trim();
    }

    // Find RECOMMENDATIONS
    const recommendationsMatch = unformattedInsights.match(/recommendations\s*([\s\S]*)/i);
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
    ,
    comparison_between_variants,
    purchase_drivers,
    competitive_insights,
    recommendations,
  ] = match;

  // Standardize variant headers in competitive insights
  const standardizedCompetitiveInsights = standardizeVariantHeaders(
    competitive_insights.trim(),
  );

  return {
    comparison_between_variants: comparison_between_variants.trim(),
    purchase_drivers: purchase_drivers.trim(),
    competitive_insights: standardizedCompetitiveInsights,
    recommendations: recommendations.trim(),
  };
}

function standardizeVariantHeaders(competitiveInsights: string): string {
  // Find and standardize variant headers like "Variant A:", "(VARIANT A)", "Variant B wins", etc.
  return (
    competitiveInsights
      // Standardize "Variant X:" format (already correct)
      .replace(/^Variant\s+([ABC]):/gim, 'Variant $1:')
      // Standardize "(VARIANT X)" format
      .replace(/^\(VARIANT\s+([ABC])\)/gim, 'Variant $1:')
      // Standardize "Variant X wins" format
      .replace(/^Variant\s+([ABC])\s+wins/gim, 'Variant $1:')
      // Standardize "– VARIANT X" format (en dash)
      .replace(/^–\s+VARIANT\s+([ABC])/gim, 'Variant $1:')
      // Standardize "– Variant X" format (en dash)
      .replace(/^–\s+Variant\s+([ABC])/gim, 'Variant $1:')
      // Standardize "- VARIANT X" format (hyphen)
      .replace(/^-\s+VARIANT\s+([ABC])/gim, 'Variant $1:')
      // Standardize "- Variant X" format (hyphen)
      .replace(/^-\s+Variant\s+([ABC])/gim, 'Variant $1:')
      // Standardize any other variant mentions at the start of paragraphs
      .replace(/^([ABC]):/gim, 'Variant $1:')
      // Handle cases where variant is mentioned without proper formatting
      .replace(/^([ABC])\s+/gim, 'Variant $1: ')
      // Ensure proper spacing after variant headers
      .replace(/^(Variant\s+[ABC]:)\s*/gim, '$1 ')
  );
}
