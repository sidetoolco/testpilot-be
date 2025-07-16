export function insightsFormatter(unformattedInsights: string) {
  const regex =
    /RESULTS OVERVIEW\s*([\s\S]*?)PURCHASE DRIVERS \s*([\s\S]*?)COMPETITIVE INSIGHTS\s*([\s\S]*?)RECOMMENDATIONS\s*([\s\S]*)/;
  const match = unformattedInsights.match(regex);

  if (!match) {
    throw new Error('Input text does not match expected format.');
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
