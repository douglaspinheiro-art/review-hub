import { describe, expect, it } from "vitest";
import { averageRating, distinctPlatformCount, negativeReviewCount } from "./review-metrics";

describe("averageRating", () => {
  it("retorna null quando não há notas", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([{ rating: null }])).toBeNull();
  });

  it("calcula a média aritmética corretamente", () => {
    expect(averageRating([{ rating: 4 }, { rating: 2 }])).toBe(3);
    expect(averageRating([{ rating: 5 }, { rating: 5 }, { rating: 2 }])).toBeCloseTo(4, 5);
  });

  it("ignora ratings inválidos", () => {
    expect(averageRating([{ rating: 5 }, { rating: 0 as unknown as number }])).toBe(5);
  });
});

describe("distinctPlatformCount", () => {
  it("conta plataformas distintas", () => {
    expect(distinctPlatformCount([{ platform: "google" }, { platform: "google" }])).toBe(1);
    expect(
      distinctPlatformCount([{ platform: "google" }, { platform: "manual" }, { platform: "facebook" }]),
    ).toBe(3);
  });
});

describe("negativeReviewCount", () => {
  it("conta notas 1 a 3", () => {
    expect(negativeReviewCount([{ rating: 1 }, { rating: 4 }, { rating: 3 }, { rating: null }])).toBe(2);
  });
});
