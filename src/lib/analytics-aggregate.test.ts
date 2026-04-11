import { describe, it, expect } from "vitest";
import { aggregateAnalyticsDailyRows, type AnalyticsDailyRow } from "./analytics-aggregate";

describe("aggregateAnalyticsDailyRows", () => {
  it("retorna zeros para lista vazia", () => {
    const r = aggregateAnalyticsDailyRows([]);
    expect(r.totals.messagesSent).toBe(0);
    expect(r.totals.messagesDelivered).toBe(0);
    expect(r.totals.messagesRead).toBe(0);
    expect(r.totals.newContacts).toBe(0);
    expect(r.totals.revenue).toBe(0);
    expect(r.deliveryRate).toBe(0);
    expect(r.readRate).toBe(0);
    expect(r.chartData).toEqual([]);
  });

  it("agrega totais e taxas corretamente", () => {
    const rows: AnalyticsDailyRow[] = [
      {
        date: "2026-04-01",
        messages_sent: 100,
        messages_delivered: 90,
        messages_read: 45,
        new_contacts: 3,
        revenue_influenced: "120.50",
      },
      {
        date: "2026-04-02",
        messages_sent: 50,
        messages_delivered: 48,
        messages_read: 24,
        new_contacts: 1,
        revenue_influenced: 30,
      },
    ];
    const r = aggregateAnalyticsDailyRows(rows);
    expect(r.totals.messagesSent).toBe(150);
    expect(r.totals.messagesDelivered).toBe(138);
    expect(r.totals.messagesRead).toBe(69);
    expect(r.totals.newContacts).toBe(4);
    expect(r.totals.revenue).toBeCloseTo(150.5, 5);
    expect(r.deliveryRate).toBe(Math.round((138 / 150) * 100));
    expect(r.readRate).toBe(Math.round((69 / 138) * 100));
    expect(r.chartData).toHaveLength(2);
    expect(r.chartData[0].enviadas).toBe(100);
    expect(r.chartData[0].entregues).toBe(90);
    expect(r.chartData[0].lidas).toBe(45);
    expect(r.chartData[0].receita).toBeCloseTo(120.5, 5);
  });

  it("evita divisão por zero em taxa de leitura quando não há entregues", () => {
    const rows: AnalyticsDailyRow[] = [
      {
        date: "2026-04-01",
        messages_sent: 10,
        messages_delivered: 0,
        messages_read: 0,
        new_contacts: 0,
        revenue_influenced: 0,
      },
    ];
    const r = aggregateAnalyticsDailyRows(rows);
    expect(r.deliveryRate).toBe(0);
    expect(r.readRate).toBe(0);
  });

  it("aceita revenue_influenced como string numérica", () => {
    const rows: AnalyticsDailyRow[] = [
      {
        date: "2026-04-01",
        messages_sent: 0,
        messages_delivered: 0,
        messages_read: 0,
        new_contacts: 0,
        revenue_influenced: "99.99",
      },
    ];
    const r = aggregateAnalyticsDailyRows(rows);
    expect(r.totals.revenue).toBeCloseTo(99.99, 5);
  });
});
