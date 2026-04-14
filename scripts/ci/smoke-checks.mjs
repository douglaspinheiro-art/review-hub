import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function mustExist(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    throw new Error(`Missing required file: ${path}`);
  }
}

function mustContain(path, snippet) {
  const full = resolve(root, path);
  const content = readFileSync(full, "utf8");
  if (!content.includes(snippet)) {
    throw new Error(`Missing required snippet in ${path}: ${snippet}`);
  }
}

try {
  mustExist("supabase/functions/unsubscribe-contact/index.ts");
  mustExist("supabase/functions/conversion-attribution/index.ts");
  mustExist("supabase/functions/process-scheduled-messages/index.ts");
  mustExist("supabase/functions/trigger-automations/index.ts");
  mustExist("supabase/functions/_shared/validation.ts");
  mustExist("src/components/ProtectedRoute.tsx");
  mustExist("src/components/BetaLimitedPageGuard.tsx");
  mustExist("src/lib/beta-scope.ts");
  mustExist("supabase/migrations/20260407174500_create_client_error_events.sql");
  mustExist("supabase/functions/webhook-refunds/index.ts");
  mustExist("supabase/functions/webhook-orders/index.ts");
  mustExist("docs/deploy-rollback-runbook.md");
  mustExist("docs/staging-go-no-go.md");

  mustContain("supabase/functions/unsubscribe-contact/index.ts", "UNSUBSCRIBE_TOKEN_SECRET");
  mustContain("supabase/functions/conversion-attribution/index.ts", "CONVERSION_ATTRIBUTION_SECRET");
  mustContain("src/components/ProtectedRoute.tsx", "if (requiredPlan)");
  mustContain("supabase/functions/process-scheduled-messages/index.ts", ".is(\"sent_at\", null)");
  mustContain("supabase/functions/trigger-automations/index.ts", ".eq(\"status\", \"pending\")");

  console.log("Smoke checks passed.");
} catch (err) {
  console.error("Smoke checks failed.");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
