/**
 * Valida variáveis de ambiente para release.
 * Uso:
 *   node scripts/ci/validate-required-env.mjs frontend   # só VITE_* (build / Vercel)
 *   node scripts/ci/validate-required-env.mjs edge      # secrets das Edge Functions (Supabase)
 *   node scripts/ci/validate-required-env.mjs all         # frontend + edge (pipeline completo)
 */
const mode = process.argv[2] ?? "all";

const FRONTEND_REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

const EDGE_REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "UNSUBSCRIBE_TOKEN_SECRET",
  "CONVERSION_ATTRIBUTION_SECRET",
  "RESEND_API_KEY",
  "PROCESS_SCHEDULED_MESSAGES_SECRET",
  "TRIGGER_AUTOMATIONS_SECRET",
  "INTEGRATION_GATEWAY_SECRET",
  "WEBHOOK_CART_SECRET",
  "FLOW_ENGINE_SECRET",
  "ALLOWED_ORIGIN",
];

/** Recomendados / integrações — não bloqueiam `edge` (beta pode não usar todos). */
const EDGE_RECOMMENDED = [
  "RESEND_DEFAULT_FROM",
  "RESEND_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "DISPATCH_NEWSLETTER_INTERNAL_SECRET",
  "WHATSAPP_WEBHOOK_SECRET",
  "META_WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "SMS_DEV_TOKEN",
  "LOGTAIL_SOURCE_TOKEN",
];

function missing(names) {
  return names.filter((name) => !process.env[name] || String(process.env[name]).trim().length === 0);
}

function run(names, label) {
  const m = missing(names);
  if (m.length > 0) {
    console.error(`${label} — variáveis ausentes ou vazias:`);
    for (const name of m) console.error(`- ${name}`);
    return false;
  }
  return true;
}

let ok = true;

if (mode === "frontend" || mode === "all") {
  ok = run(FRONTEND_REQUIRED, "Frontend (Vite)") && ok;
}

if (mode === "edge" || mode === "all") {
  ok = run(EDGE_REQUIRED, "Edge Functions (Supabase)") && ok;
  const rec = missing(EDGE_RECOMMENDED);
  if (rec.length > 0) {
    console.warn("Edge — recomendadas (não bloqueiam):");
    for (const name of rec) console.warn(`- ${name}`);
  }
}

if (!ok) {
  process.exit(1);
}

console.log(`Env validation passed (${mode}).`);
