import { describe, it, expect } from "vitest";
import { parseDispatchNewsletterResponse } from "@/lib/dispatch-newsletter-client";

describe("parseDispatchNewsletterResponse", () => {
  it("aceita success + total (edge em fila)", () => {
    expect(parseDispatchNewsletterResponse({ success: true, total: 1200 })).toEqual({
      sent: 0,
      failed: 0,
      total: 1200,
      scheduled: false,
      queued: true,
    });
  });

  it("aceita queued explícito", () => {
    expect(parseDispatchNewsletterResponse({ queued: true, total: 50 })).toEqual({
      sent: 0,
      failed: 0,
      total: 50,
      scheduled: false,
      queued: true,
    });
  });

  it("aceita resposta de teste com sent/failed", () => {
    expect(parseDispatchNewsletterResponse({ sent: 10, failed: 1, total: 11 })).toEqual({
      sent: 10,
      failed: 1,
      total: 11,
      scheduled: false,
    });
  });

  it("scheduled só no cliente", () => {
    expect(parseDispatchNewsletterResponse({ scheduled: true })).toEqual({
      sent: 0,
      failed: 0,
      scheduled: true,
    });
  });

  it("lança em error string", () => {
    expect(() => parseDispatchNewsletterResponse({ error: "falhou" })).toThrow(/falhou/);
  });
});
