import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260411200000_ai_agent_config_tenant_rls.sql",
);

describe("ai_agent_config RLS (contrato da migração)", () => {
  it("define políticas tenant com auth_row_read/write_user_store", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("ai_agent_config_select_tenant");
    expect(sql).toContain("ai_agent_config_insert_tenant");
    expect(sql).toContain("ai_agent_config_update_tenant");
    expect(sql).toContain("auth_row_read_user_store");
    expect(sql).toContain("auth_row_write_user_store");
  });
});
