# Acesso admin total às lojas — versão revisada

## Objetivo

Permitir que o dono da plataforma (role `admin`) entre no dashboard de qualquer loja para suporte/debug, com:

- **Auditoria obrigatória** de cada entrada/saída (LGPD)
- **Read-only por padrão**, escrita só com toggle explícito + TTL
- **Bypass RLS mínimo necessário** (sem abrir `profiles` para sempre)
- **Expiração automática** da sessão de impersonação

---

## Arquitetura

```text
[Admin] → /admin → aba Lojas → "Entrar"
   │
   ▼
RPC admin_enter_store(store_id)  ──► grava audit_logs
   │                                  cria/atualiza admin_active_sessions
   ▼
sessionStorage: { userId, storeId, storeName, expiresAt, writeMode:false }
   │
   ▼
StoreScopeContext usa userId/storeId impersonados
   │
   ▼
Banner âmbar fixo: [👁 Visualizando ▸ toggle ✏️ Editar ▸ botão Sair]
```

Bypass RLS é checado via função `is_admin_with_active_impersonation(target_user_id)` que verifica:
1. `has_role(auth.uid(), 'admin')`
2. existe row em `admin_active_sessions` para esse admin com `target_user_id` = dono da loja e `expires_at > now()`

Para escrita, exige adicionalmente `write_enabled = true` na sessão.

---

## Passo 1 — Migration SQL

Arquivo: `supabase/migrations/20260427120000_admin_store_impersonation.sql`

### 1a. Tabela de sessões ativas de impersonação

```sql
CREATE TABLE public.admin_active_sessions (
  admin_user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL,
  target_store_id uuid NOT NULL,
  write_enabled   boolean NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
ALTER TABLE public.admin_active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_sessions_self ON public.admin_active_sessions
  FOR SELECT TO authenticated
  USING (admin_user_id = auth.uid());
-- Sem INSERT/UPDATE/DELETE direto: tudo via RPCs SECURITY DEFINER.
```

### 1b. Função de checagem (usada pelos helpers)

```sql
CREATE OR REPLACE FUNCTION public.admin_can_access_user(p_target_user_id uuid, p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_active_sessions s
    WHERE s.admin_user_id = (SELECT auth.uid())
      AND s.target_user_id = p_target_user_id
      AND s.expires_at > now()
      AND (NOT p_write OR s.write_enabled)
  ) AND public.has_role((SELECT auth.uid()), 'admin'::app_role);
$$;
```

### 1c. Atualizar helpers RLS (cobre 30+ tabelas tenant)

```sql
CREATE OR REPLACE FUNCTION public.auth_row_read_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user_id = (SELECT auth.uid())
      OR (p_store_id IS NOT NULL AND public.auth_team_read_store(p_store_id))
      OR (p_store_id IS NULL AND public.auth_team_read_owner(p_user_id))
      OR public.admin_can_access_user(p_user_id, false);
$$;

CREATE OR REPLACE FUNCTION public.auth_row_write_user_store(p_user_id uuid, p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user_id = (SELECT auth.uid())
      OR (p_store_id IS NOT NULL AND public.auth_team_write_store(p_store_id))
      OR (p_store_id IS NULL AND public.auth_team_write_owner(p_user_id))
      OR public.admin_can_access_user(p_user_id, true);
$$;
```

Também atualizar `auth_team_read_owner` / `auth_team_write_owner` se forem usadas isoladamente (verificar antes; provavelmente não é necessário).

### 1d. Policy `stores` — admin lê stores apenas durante impersonação ativa

```sql
DROP POLICY IF EXISTS stores_select_tenant ON public.stores;
CREATE POLICY stores_select_tenant ON public.stores
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.auth_team_read_store(id)
    OR public.admin_can_access_user(user_id, false)
  );
```

`profiles` **não** é alterada — admin lê dados via RPC `admin_list_stores()`.

### 1e. RPC para listar lojas (sem expor `profiles`/`auth.users`)

```sql
CREATE OR REPLACE FUNCTION public.admin_list_stores(p_search text DEFAULT NULL)
RETURNS TABLE(
  store_id uuid, store_name text, store_user_id uuid,
  user_email text, user_full_name text,
  plan text, subscription_status text,
  onboarding_completed boolean, store_created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.user_id,
         u.email::text, p.full_name,
         p.plan, p.subscription_status,
         p.onboarding_completed, s.created_at
  FROM public.stores s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE p_search IS NULL
     OR s.name ILIKE '%'||p_search||'%'
     OR u.email ILIKE '%'||p_search||'%'
  ORDER BY s.created_at DESC
  LIMIT 200;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_stores(text) TO authenticated;
```

### 1f. RPCs de entrada/saída/escrita — gravam `audit_logs`

```sql
CREATE OR REPLACE FUNCTION public.admin_enter_store(p_store_id uuid)
RETURNS TABLE(target_user_id uuid, target_store_name text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_name text; v_exp timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT user_id, name INTO v_owner, v_name FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'store_not_found'; END IF;

  v_exp := now() + interval '1 hour';
  INSERT INTO public.admin_active_sessions(admin_user_id, target_user_id, target_store_id, expires_at, write_enabled)
  VALUES (auth.uid(), v_owner, p_store_id, v_exp, false)
  ON CONFLICT (admin_user_id) DO UPDATE
    SET target_user_id = EXCLUDED.target_user_id,
        target_store_id = EXCLUDED.target_store_id,
        expires_at = EXCLUDED.expires_at,
        write_enabled = false,
        started_at = now();

  INSERT INTO public.audit_logs(user_id, action, resource, result, store_id, metadata)
  VALUES (auth.uid(), 'admin_impersonate_start', 'store', 'success', p_store_id,
          jsonb_build_object('target_user_id', v_owner, 'expires_at', v_exp));

  RETURN QUERY SELECT v_owner, v_name, v_exp;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_enter_store(uuid) TO authenticated;
```

Análogos: `admin_exit_store()` (apaga row + log `admin_impersonate_end`) e `admin_set_write_mode(p_enabled boolean)` (atualiza `write_enabled`, loga `admin_write_mode_toggle` com valor).

---

## Passo 2 — `StoreScopeContext.tsx`

Adicionar ao tipo:

```ts
type AdminImpersonation = {
  targetUserId: string;
  targetStoreId: string;
  storeName: string;
  expiresAt: string;
  writeEnabled: boolean;
};

type StoreScopeValue = {
  /* …campos existentes… */
  adminImpersonating: AdminImpersonation | null;
  adminEnterStore: (storeId: string) => Promise<void>;
  adminExitStore: () => Promise<void>;
  adminSetWriteMode: (enabled: boolean) => Promise<void>;
};
```

Lógica:

- Estado persistido em `sessionStorage` chave `ltv_admin_imp`
- Provider hidrata na montagem; se `expiresAt < now()`, descarta + chama `admin_exit_store`
- `adminEnterStore(storeId)`: chama RPC, salva no `sessionStorage`, faz `qc.clear()` e seta `activeStoreId = targetStoreId`
- `adminExitStore`: RPC + remove `sessionStorage` + `qc.clear()` + redirect `/admin`
- Quando `adminImpersonating` ativo: `effectiveUserId = targetUserId`, queryFn de `stores` filtra por esse user_id
- Timer interno: a cada 60s checa expiração; se vencer, dispara `adminExitStore` automático com toast "Sessão de admin expirou"

---

## Passo 3 — `AdminImpersonationBanner.tsx` (novo)

Renderiza só se `adminImpersonating !== null`.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🛡 Admin · Loja: <Nome>  ·  Expira em 47min                            │
│ [👁 Visualizando]  [Toggle ✏️ Editar]   [⏻ Sair]                       │
└────────────────────────────────────────────────────────────────────────┘
```

- Fundo `bg-amber-500/15`, borda inferior `border-amber-500`
- Toggle "Editar": `AlertDialog` de confirmação ("Ações afetarão dados reais da loja"), depois `adminSetWriteMode(true)`
- Quando `writeEnabled=true`: badge muda para `bg-red-500/20` "✏️ MODO EDIÇÃO"
- Contador de expiração calculado de `expiresAt`

---

## Passo 4 — `DashboardLayout.tsx`

Importar `AdminImpersonationBanner` e renderizar antes do `<main>` (empurra conteúdo, não sobrepõe).

---

## Passo 5 — Aba "Lojas" em `Admin.tsx`

Nova `TabsTrigger value="stores"` com ícone `Store`. Conteúdo:

- Input de busca (debounce 300ms) → `supabase.rpc('admin_list_stores', { p_search })`
- Tabela: Nome | Email do owner | Plano | Status | Onboarding | Criada em | **Entrar**
- Botão "Entrar": chama `adminEnterStore(store_id)` do context → navega `/dashboard`
- Empty state: "Nenhuma loja encontrada"

---

## Verificação

1. Aplicar migration via `npm run supabase:db-push`
2. Como admin: `/admin` → aba Lojas lista todas → "Entrar" mostra dashboard com banner âmbar
3. Tentar editar (ex: criar campanha) **sem** ativar modo edição → erro RLS esperado
4. Ativar "Editar" → ação funciona; verificar `audit_logs` tem 3 rows (`start`, `write_mode_toggle`, ação)
5. Aguardar/forçar expiração → toast aparece e contexto retorna ao admin
6. Como usuário comum: aba Lojas inacessível; queries continuam restritas à própria loja (regressão zero)
7. Testar `admin_enter_store` chamada por usuário não-admin → `forbidden`

---

## Notas técnicas

- **Edge Functions** com `service_role` ignoram RLS — sem mudança necessária
- **Realtime subscriptions:** auditar `.subscribe(` em hooks; ao trocar contexto, `qc.clear()` desmonta queries mas subscriptions WS precisam ser recriadas — `useEffect` deps em `effectiveUserId` resolve
- **Cache:** `qc.clear()` (não `invalidateQueries`) evita vazar cache da loja anterior
- **`admin_active_sessions` PRIMARY KEY = admin_user_id** garante 1 sessão por admin (não pode estar em duas lojas ao mesmo tempo)
- **TTL 1h**, renovável re-entrando; `write_enabled` reseta para `false` em cada nova entrada
- **`audit_logs` já bloqueia INSERT/UPDATE/DELETE** via RLS — RPCs `SECURITY DEFINER` contornam, correto
