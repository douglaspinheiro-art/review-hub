/**
 * Smoke de carga para PostgREST: RPCs usados na home do dashboard.
 *
 * Pré-requisos:
 *   npm i -g k6
 *   export K6_SUPABASE_URL="https://xxx.supabase.co"
 *   export K6_SUPABASE_ANON_KEY="eyJ..."
 *   export K6_JWT="eyJ... access token de um utilizador de teste"
 *   export K6_STORE_ID="uuid da loja desse utilizador"
 *
 * Executar:
 *   k6 run scripts/load/k6-dashboard-home.js
 *
 * Cenário: 100 utilizadores virtuais a invocar os RPCs em loop curto (ajuste stages para stress real).
 */
import http from "k6/http";
import { check, sleep } from "k6";

const url = __ENV.K6_SUPABASE_URL;
const anon = __ENV.K6_SUPABASE_ANON_KEY;
const jwt = __ENV.K6_JWT;
const storeId = __ENV.K6_STORE_ID;

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<8000"],
  },
};

function rpc(name, args) {
  const res = http.post(
    `${url}/rest/v1/rpc/${name}`,
    JSON.stringify(args),
    {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    },
  );
  return res;
}

export default function () {
  if (!url || !anon || !jwt || !storeId) {
    throw new Error("Defina K6_SUPABASE_URL, K6_SUPABASE_ANON_KEY, K6_JWT e K6_STORE_ID");
  }

  const snap = rpc("get_dashboard_snapshot", {
    p_store_id: storeId,
    p_period_days: 30,
  });
  check(snap, { "snapshot 200": (r) => r.status === 200 });

  const base = rpc("get_conversion_baseline_summary", {
    p_store_id: storeId,
    p_period_days: 30,
  });
  check(base, { "baseline 200": (r) => r.status === 200 });

  sleep(1);
}
