import type { RetentionNode } from "@/lib/retention-graph";

export type PropensityBand = "alto" | "medio" | "baixo";

export type PropensityOutput = {
  bestNode: RetentionNode;
  confidence: number;
  band: PropensityBand;
};

export function getPropensityOutput(nodes: RetentionNode[]): PropensityOutput {
  const sorted = [...nodes].sort((a, b) => b.score - a.score);
  const bestNode = sorted[0];
  const second = sorted[1];
  const gap = Math.max(0, bestNode.score - (second?.score ?? 0));
  const confidence = Math.min(99, 55 + gap);
  const band: PropensityBand = confidence >= 75 ? "alto" : confidence >= 62 ? "medio" : "baixo";
  return { bestNode, confidence, band };
}
