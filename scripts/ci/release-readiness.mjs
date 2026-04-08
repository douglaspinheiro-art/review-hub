/**
 * Checagens automatizáveis antes de liberar usuários reais.
 * Não substitui: Auth no Dashboard, SMTP, nem signup manual em produção.
 *
 * Validação de env (frontend/edge) só roda se as variáveis já estiverem no ambiente
 * (ex.: pipeline com secrets). Caso contrário, imprime aviso e segue.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "..", "..");

function runNode(scriptPath, extraArgs = []) {
  const r = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runNpmScript(scriptName) {
  const r = spawnSync("npm", ["run", scriptName], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runNode(join(root, "smoke-checks.mjs"));
runNpmScript("test:business");

const hasFrontend = process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY;
if (hasFrontend) {
  runNode(join(root, "validate-required-env.mjs"), ["frontend"]);
} else {
  console.warn("release:check — skip validate:env:frontend (defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para validar).");
}

const hasEdge = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
if (hasEdge) {
  runNode(join(root, "validate-required-env.mjs"), ["edge"]);
} else {
  console.warn("release:check — skip validate:env:edge (defina secrets Supabase no ambiente ou rode: npm run validate:env:edge antes do deploy).");
}

console.log("release:check concluído.");
