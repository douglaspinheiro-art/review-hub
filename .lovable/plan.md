
O usuário tem razão. O fluxo correto é:

`/diagnostico` (form) → `/analisando` (loading IA) → `/resultado` (mostra diagnóstico + CTA de venda)

`/resultado` **nunca** deveria mostrar empty state pedindo "rodar diagnóstico" — se o usuário chegou ali, é porque acabou de rodar. Se não há `diagnostics_v3`, é bug (falha na geração) ou acesso direto fora do fluxo, não estado normal.

Eu introduzi esse erro na iteração anterior quando trocamos os números fake por "empty state". A solução correta é:

## Correção do `/resultado`

**Comportamento atual (errado):**
- Sem diagnóstico no DB → mostra card "Você ainda não rodou um diagnóstico" + CTA `/diagnostico`

**Comportamento correto:**
- `/resultado` é página de resultado de venda. Sempre assume que veio do funil.
- Se `diagnostics_v3` está vazio → redirecionar automaticamente para `/diagnostico` (usuário entrou pela URL direta sem ter rodado).
- Se há diagnóstico → renderiza normal com CTA de venda (já está correto).
- Remove o bloco fallback "empty state".

**Mudança em `src/pages/Resultado.tsx`:**
1. Após `setLoading(false)`, se `!diagData` e `user?.id` existe → `navigate("/diagnostico", { replace: true })`.
2. Remover o bloco JSX `{!diagnostic && (...)}` (empty state).
3. Manter loader enquanto decide redirect.

Resultado: usuário no funil sempre vê diagnóstico + CTA de venda. Acesso direto sem dados → vai para o form. Zero confusão.
