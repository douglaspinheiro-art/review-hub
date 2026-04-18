

## Root cause

Edge `gerar-diagnostico` falha com `Failed to fetch` (visto no network log). Duas causas combinadas em `supabase/functions/gerar-diagnostico/index.ts`:

1. `validateBrowserOrigin(req)` é chamado **antes** do `if (req.method === "OPTIONS")`. Como o secret `ALLOWED_ORIGIN` não está configurado (ou não bate com o origin atual da preview Lovable), o **preflight CORS** retorna 500/403 sem `Access-Control-Allow-Origin` → o browser mostra `Failed to fetch`.
2. Sem chamada bem-sucedida → nenhuma linha em `diagnostics_v3` → `/resultado` faz polling 45× e fica preso em "Carregando seu diagnóstico…" para sempre (não há timeout/fallback).

Outras edges no projeto têm o mesmo padrão problemático, mas o foco aqui é destravar `/resultado`.

## Fix

### 1. `supabase/functions/gerar-diagnostico/index.ts`
- Mover OPTIONS para **antes** de qualquer validação (preflight sempre retorna 200 com `corsHeaders`).
- Tornar `validateBrowserOrigin` **opcional**: se `ALLOWED_ORIGIN` não estiver configurado, apenas log warning e segue (em vez de 500). Isso evita travar o produto quando o secret não foi populado na preview Lovable.

```ts
serve(async (req) => {
  // CORS preflight FIRST — sempre 200
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Origin check (não bloqueia se ALLOWED_ORIGIN ausente)
  const originCheck = validateBrowserOrigin(req);
  if (originCheck) return originCheck;
  ...
});
```

E em `_shared/edge-utils.ts → validateBrowserOrigin`:
```ts
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
if (!allowedOrigin) {
  console.warn("ALLOWED_ORIGIN not set — skipping origin validation");
  return null;
}
```

### 2. `src/pages/Resultado.tsx` — fallback de UX
Se após 45 tentativas (~45s) ainda não houver diagnóstico:
- `setLoading(false)` + `setMissingDiagnostic(true)` (estado já existe).
- Mostrar card com mensagem "Não conseguimos gerar seu diagnóstico" + botão **"Tentar novamente"** (volta para `/analisando`) e **"Voltar para o diagnóstico"** (`/diagnostico`).

Verificar se o branch `missingDiagnostic` já está renderizado no JSX; caso não, adicionar.

## Arquivos

- `supabase/functions/gerar-diagnostico/index.ts` — reordenar OPTIONS antes de origin check
- `supabase/functions/_shared/edge-utils.ts` — `validateBrowserOrigin` tolerante a `ALLOWED_ORIGIN` ausente (afeta todas as edges que usam, mas muda só o comportamento quando o secret falta — produção continua segura se o secret estiver definido)
- `src/pages/Resultado.tsx` — fallback de UI quando polling esgota

## Fora de escopo

- Não vamos definir `ALLOWED_ORIGIN` agora (a preview Lovable usa origin dinâmico). Em produção (`ltvboost.com.br`), basta setar o secret no Dashboard Supabase.
- Não vamos refatorar todas as outras edges com o mesmo bug — só `gerar-diagnostico` (a do bloqueio atual). As demais podem ser ajustadas em sequência se aparecerem sintomas.

