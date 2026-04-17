

## Causa raiz da inconsistência

O passo 2 e o passo 3 usam **fontes de verdade diferentes** para saber se a loja está conectada:

| Passo | Como verifica | O que vê |
|---|---|---|
| **2** | State local `integrationValid` (true após validar API ou via `validate-integration`) | "✓ Conectado" — sem consultar o banco |
| **3** | Edge function `fetch-store-metrics` que busca em `integrations` por `is_active=true` AND `type IN (shopify, nuvemshop, ...)` | "Nenhuma integração ativa" (404) |

### Por que dá conflito

A integração **só é gravada na tabela `integrations`** dentro de `handleFinish` (linha 487 — `supabase.from("integrations").upsert(...)`), que **só roda no final do passo 4**. 

Ou seja, no passo 2 o usuário valida as credenciais (state vira `integrationValid=true`), mas **nada é persistido**. Quando o passo 3 monta e chama `fetch-store-metrics`, a edge não encontra nada em `integrations` → retorna 404 → "Nenhuma integração ativa".

Casos extras que reforçam o bug:
- OAuth (Shopify/Nuvemshop) já cria a integração no callback, então nesses casos passo 3 funciona — só plataformas com API Key (Yampi/Tray/WooCommerce/Dizy) quebram.
- O `useEffect` que tenta detectar integração existente (linha ~225) faz query certa, mas só roda no mount inicial — não após validar no passo 2.

### Correção proposta

**Persistir a integração assim que for validada no passo 2**, em vez de esperar o `handleFinish`.

1. **Em `validateIntegration` (Onboarding.tsx ~linha 377)** — após `data?.ok === true`, fazer upsert imediato em `integrations`:
   - Buscar/garantir `store_id` do usuário (helper já existe no `handleFinish`).
   - `upsert({ user_id, store_id, type: platformInfo.type, name: plataforma, config: integrationConfig, is_active: true }, { onConflict: "store_id,type" })`.
   - Disparar `post-integration-setup` (best-effort) — igual ao handleFinish.

2. **Extrair helper** `persistIntegration(storeId)` reutilizado por `validateIntegration` e `handleFinish` (evita duplicação).

3. **Remover do `handleFinish`** o bloco de upsert da integração (passa a ser idempotente — se já existe, ok; se não, faz fallback).

4. **Bonus**: no passo 3, quando `fetch-store-metrics` retornar 404 mas `integrationValid===true` no state, mostrar mensagem mais clara ("Sincronizando com a plataforma...") em vez de erro silencioso.

### Detalhes técnicos
- **Arquivo**: `src/pages/Onboarding.tsx` (`validateIntegration` ~370-404, `handleFinish` ~485-503).
- **Backend**: nenhuma mudança — a edge `fetch-store-metrics` já está correta.
- **RLS**: `integrations` tem policy `auth_row_write_user_store(user_id, store_id)` — upsert no front funciona com a sessão atual.
- **Edge case**: se o usuário voltar ao passo 2 e mudar credenciais, o upsert atualiza a linha existente (mesmo `onConflict`).

