import { describe, it, expect } from "vitest";
import { aiAgentConfigQueryKey } from "@/hooks/useAiAgentConfig";

describe("aiAgentConfigQueryKey", () => {
  it("combina user e loja para cache estável", () => {
    expect(aiAgentConfigQueryKey("u1", "s1")).toEqual(["ai-agent-config", "u1", "s1"]);
  });

  it("normaliza undefined para string vazia", () => {
    expect(aiAgentConfigQueryKey(undefined, undefined)).toEqual(["ai-agent-config", "", ""]);
  });
});
