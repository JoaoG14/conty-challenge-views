export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: number[]): number {
  return sum(values) / values.length;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function variation(values: number[]) {
  const average = mean(values);
  const squaredDifferences = values.reduce((total, value) => total + (value - average) ** 2, 0);
  const standardDeviation = Math.sqrt(squaredDifferences / (values.length - 1));
  return {
    mean: average,
    standard_deviation: standardDeviation,
    variation_index: average > 0 ? standardDeviation / Math.sqrt(average) : null,
  };
}

export function followingDrop(views: number[], end: number, reference: number) {
  if (reference <= 0 || end + 3 >= views.length) return { following_mean: null, drop: null };
  const followingMean = mean(views.slice(end + 1, end + 4));
  return { following_mean: followingMean, drop: 1 - followingMean / reference };
}
