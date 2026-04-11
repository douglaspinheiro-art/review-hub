import { describe, it, expect } from "vitest";
import {
  metaShowsWebhookHelp,
  shouldWarnIncompleteSetup,
} from "../connection-ui";

describe("connection-ui", () => {
  it("metaShowsWebhookHelp só com phone id (sem token no objeto)", () => {
    expect(metaShowsWebhookHelp({ provider: "meta_cloud", meta_phone_number_id: "123" })).toBe(true);
    expect(metaShowsWebhookHelp({ provider: "meta_cloud", meta_phone_number_id: "" })).toBe(false);
    expect(metaShowsWebhookHelp({ provider: "evolution", meta_phone_number_id: "123" })).toBe(false);
  });

  it("shouldWarnIncompleteSetup ignora conexão já connected", () => {
    expect(
      shouldWarnIncompleteSetup({
        provider: "meta_cloud",
        status: "connected",
        meta_phone_number_id: null,
      }),
    ).toBe(false);
  });

  it("shouldWarnIncompleteSetup Meta sem phone id", () => {
    expect(
      shouldWarnIncompleteSetup({ provider: "meta_cloud", status: "disconnected", meta_phone_number_id: null }),
    ).toBe(true);
  });

  it("shouldWarnIncompleteSetup para provider legado não-Meta", () => {
    expect(shouldWarnIncompleteSetup({ provider: "evolution", status: "disconnected" })).toBe(true);
  });
});
