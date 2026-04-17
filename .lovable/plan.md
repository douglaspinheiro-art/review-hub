
## Problema

Após `/analisando`, o usuário é redirecionado para `/dashboard/convertiq/diagnostico` e depois para `/planos`, em vez de ir para `/resultado` (que tem o checkout inline).

## Investigação necessária

Preciso confirmar onde está o redirect errado. Suspeitos:
1. `Analisando.tsx` — vejo que ele faz `navigate("/resultado")` em 3 lugares (realtime, success, fallback). Então o redirect inicial está certo.
2. Provável culpado: `/resultado` (Resultado.tsx) ou guard em rota que está bouncing o user para `/dashboard/convertiq/diagnostico` → que por sua vez redireciona para `/planos`.
3. Ou: alguma lógica em `ProtectedRoute` / `getPostLoginRoute` que considera "tem diagnóstico → vai para dashboard" antes da assinatura.

Pelo `next-step.ts`:
- com diagnóstico + sem assinatura → `/resultado` ✅ (correto)

Então o problema deve estar em:
- **`Resultado.tsx`** fazendo algum redirect indevido (talvez para `/dashboard/convertiq/diagnostico` quando detecta diagnóstico salvo)
- ou **`ConvertIQDiagnostico.tsx`** redirecionando para `/planos`

Preciso ler ambos para confirmar antes de planejar o fix.
