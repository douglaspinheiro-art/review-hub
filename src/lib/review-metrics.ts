/** Métricas derivadas da lista de reviews (KPIs no dashboard). */

export type ReviewRatingRow = { rating: number | null };
export type ReviewPlatformRow = { platform: string };

export function averageRating(reviews: ReviewRatingRow[]): number | null {
  const rated = reviews.filter(
    (r): r is { rating: number } =>
      r.rating != null && Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5,
  );
  if (rated.length === 0) return null;
  const sum = rated.reduce((s, r) => s + r.rating, 0);
  return sum / rated.length;
}

export function distinctPlatformCount(reviews: ReviewPlatformRow[]): number {
  return new Set(reviews.map((r) => r.platform).filter(Boolean)).size;
}

export function negativeReviewCount(reviews: ReviewRatingRow[]): number {
  return reviews.filter((r) => r.rating != null && r.rating <= 3).length;
}
