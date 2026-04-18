
## Problema

Erro em produção:
```
[Supabase] Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ficheiro .env
```

O `.env` tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, mas o cliente (`src/integrations/supabase/client.ts`) lê `VITE_SUPABASE_ANON_KEY`. Mismatch → throw no boot → tela branca.

## Fix

Atualizar `src/integrations/supabase/client.ts` para aceitar ambos os nomes (`VITE_SUPABASE_ANON_KEY` **ou** `VITE_SUPABASE_PUBLISHABLE_KEY`), preferindo o que existir. Mesmo tratamento para a URL (já bate, mas mantém consistente).

```ts
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY 
              ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
```

Também atualizar `src/vite-env.d.ts` para declarar `VITE_SUPABASE_PUBLISHABLE_KEY` opcional.

## Arquivos

- `src/integrations/supabase/client.ts` — fallback nas duas envs
- `src/vite-env.d.ts` — tipo opcional para `VITE_SUPABASE_PUBLISHABLE_KEY`

Sem mudança no `.env` (Lovable popula `PUBLISHABLE_KEY` automaticamente).
