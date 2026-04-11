import { describe, expect, it } from "vitest";
import {
  FORECAST_MIN_DAYS,
  bucketRevenueRows,
  buildForecastProjection,
  formatForecastYAxisBrl,
} from "./forecast-projection";
import type { AnalyticsDailyRow } from "./analytics-aggregate";

describe("FORECAST_MIN_DAYS", () => {
  it("is at least 7 for stable projection", () => {
    expect(FORECAST_MIN_DAYS).toBeGreaterThanOrEqual(7);
  });
});

describe("bucketRevenueRows", () => {
  it("returns empty for empty input", () => {
    expect(bucketRevenueRows([], 4)).toEqual([]);
  });

  it("aggregates into ordered buckets", () => {
    const rows = [
      { date: "2026-01-01", revenue_influenced: 10 },
      { date: "2026-01-02", revenue_influenced: 20 },
      { date: "2026-01-03", revenue_influenced: 30 },
    ];
    const b = bucketRevenueRows(rows, 2);
    expect(b).toHaveLength(2);
    expect(b[0].realizado + b[1].realizado).toBe(60);
  });
});

describe("buildForecastProjection", () => {
  it("returns zeros for empty rows", () => {
    const r = buildForecastProjection([]);
    expect(r.projected30).toBe(0);
    expect(r.chartBuckets).toEqual([]);
  });

  it("computes flat trend when halves are equal", () => {
    const rows: AnalyticsDailyRow[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      messages_sent: 0,
      messages_delivered: 0,
      messages_read: 0,
      new_contacts: 0,
      revenue_influenced: 100,
    }));
    const r = buildForecastProjection(rows);
    expect(r.trendPct).toBe(0);
    expect(r.avgDaily).toBe(100);
    expect(r.realizedWindowTotal).toBe(1000);
    expect(r.projected30).toBe(3000);
  });

  it("damps strong growth", () => {
    const low: AnalyticsDailyRow[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      messages_sent: 0,
      messages_delivered: 0,
      messages_read: 0,
      new_contacts: 0,
      revenue_influenced: 10,
    }));
    const high: AnalyticsDailyRow[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-${String(i + 6).padStart(2, "0")}`,
      messages_sent: 0,
      messages_delivered: 0,
      messages_read: 0,
      new_contacts: 0,
      revenue_influenced: 100,
    }));
    const r = buildForecastProjection([...low, ...high]);
    expect(r.trendPct).toBeGreaterThan(0);
    const naive = r.avgDaily * 30;
    expect(r.projected30).toBeLessThanOrEqual(naive * 1.26);
  });

  it("handles single row without throwing", () => {
    const rows: AnalyticsDailyRow[] = [
      {
        date: "2026-02-01",
        messages_sent: 0,
        messages_delivered: 0,
        messages_read: 0,
        new_contacts: 0,
        revenue_influenced: 50,
      },
    ];
    const r = buildForecastProjection(rows);
    expect(r.realizedWindowTotal).toBe(50);
    expect(r.chartBuckets.length).toBeGreaterThan(0);
  });
});

describe("formatForecastYAxisBrl", () => {
  it("uses compact k for large values", () => {
    expect(formatForecastYAxisBrl(5000)).toMatch(/k/);
  });

  it("uses full currency for small values", () => {
    const s = formatForecastYAxisBrl(400);
    expect(s).toContain("400");
    expect(s).not.toMatch(/NaN/);
  });
});
