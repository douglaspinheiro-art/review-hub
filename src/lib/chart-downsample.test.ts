import { describe, expect, it } from "vitest";
import { downsampleDailySeriesBySum } from "./chart-downsample";

describe("downsampleDailySeriesBySum", () => {
  it("não altera séries curtas", () => {
    const rows = [
      { d: "1", a: 1, b: 2 },
      { d: "2", a: 3, b: 4 },
    ];
    expect(downsampleDailySeriesBySum(rows, ["a", "b"], 10)).toEqual(rows);
  });

  it("agrega somas por bucket", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ day: i, v: 1 }));
    const out = downsampleDailySeriesBySum(rows, ["v"], 5);
    expect(out).toHaveLength(5);
    expect(out.every((r) => r.v === 2)).toBe(true);
  });
});
