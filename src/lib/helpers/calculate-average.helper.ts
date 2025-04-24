export function calculateAverageScore(scores: number[]) {
  const validScores = scores.filter(
    (score) => typeof score === 'number' && !isNaN(score),
  );
  if (!validScores.length) return 0;
  const sum = validScores.reduce((a, b) => a + b, 0);
  return sum / validScores.length;
}
