/** Modelo usado nas Edge Functions do agente (fonte única para UI e docs). */
export const AI_AGENT_EDGE_MODEL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_AI_AGENT_EDGE_MODEL) ||
  "claude-3-5-sonnet-20241022";
