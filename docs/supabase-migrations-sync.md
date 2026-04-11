# Supabase: alinhar migrações local ↔ remoto

O **projeto remoto** ligado a este repositório está em `supabase/config.toml` (`project_id`) e, após `supabase link`, também em `supabase/.temp/` (pasta ignorada pelo Git).

## Verificar se local e remoto batem

Na raiz do repositório, com [Supabase CLI](https://supabase.com/docs/guides/cli) disponível e sessão/link válidos:

```bash
npx supabase migration list
```

Interpretação das colunas:

| Local | Remoto | Significado |
|-------|--------|-------------|
| preenchido | preenchido (mesmo timestamp) | Migração existe no repo **e** já foi aplicada no banco remoto. |
| vazio | preenchido | Aplicada **só no remoto** (SQL direto no Dashboard, outra máquina, ou arquivo removido do repo). O repo está **atrás**. |
| preenchido | vazio | Arquivo existe no repo **mas não** foi aplicado no remoto. Rode `db push` (ou aplique o SQL manualmente). |

Atalho no `package.json`: `npm run supabase:migration-list`.

## Drift: versões só no remoto (CLI bloqueia `db push`)

Se `supabase db push` responder com *Remote migration versions not found in local migrations directory*, o histórico do projeto linkado tem timestamps **sem arquivo** em `supabase/migrations/`.

**Correção usada neste repo:** criar arquivos `TIMESTAMP_remote_placeholder.sql` com o mesmo prefixo numérico e conteúdo mínimo (`SELECT 1;`), como os já existentes `20260407153932_remote_placeholder.sql`. Assim o `migration list` alinha Local | Remoto e o `db push` pode aplicar só o que falta.

Não substitua placeholders pelo SQL “real” antigo se você não tiver o script original — o remoto já aplicou essas versões; o placeholder é só paridade de metadados.

## Estado esperado após Meta WhatsApp (migração + deploy)

- `20260410120000_whatsapp_provider_meta.sql` deve aparecer nas duas colunas do `migration list`.
- Funções deployadas: `meta-whatsapp-webhook` (webhook público Meta — em geral com **JWT desligado** no painel se a Meta não enviar `Authorization`) e `meta-whatsapp-send` (chamada do browser com sessão Supabase).

Reexecute `npm run supabase:migration-list` após qualquer `push`/`pull`.

## Corrigir: “inserted before the last migration on remote”

Quando existe um ficheiro local com timestamp **anterior** a migrações **já aplicadas** no remoto, o `db push` normal recusa.

1. Ver o gap: `npm run supabase:migration-list` (coluna **Local** preenchida e **Remoto** vazio numa linha **acima** de linhas já alinhadas).
2. Rever o SQL das migrações pendentes (são idempotentes? `IF NOT EXISTS` / `OR REPLACE`?).
3. Aplicar com confirmação explícita:

```bash
npx supabase db push --linked --include-all
```

O `--include-all` aplica migrações pendentes mesmo fora da ordem cronológica estrita. **Só** usar depois de ler o SQL (evitar DDL que conflite com o que já está no remoto).

## Corrigir: aplicar o que falta no remoto

```bash
npx supabase db push
```

Isso aplica migrações locais pendentes no projeto linkado. **Confirme que o `project_id` é o ambiente desejado (dev/staging/prod).**

Alternativa: copiar o conteúdo do arquivo `.sql` e rodar no **SQL Editor** do Supabase (útil se o CLI não estiver linkado).

## Corrigir: trazer o histórico “só remoto” para o Git

Para não perder rastreabilidade quando o remoto tem versões que não estão em `supabase/migrations/`:

```bash
npx supabase db pull
```

Gera nova(s) migração(ões) a partir do diff. Revise o SQL antes de commitar.

## Supabase local (Docker) vs remoto

- **`supabase start`** sobe Postgres/Studio **local**; as migrações aplicadas são as da pasta `migrations` no momento do reset/start.
- O **`migration list`** acima compara **arquivos da pasta `migrations`** com o **banco remoto linkado**, não necessariamente com o Postgres do Docker local.
- Para alinhar **local Docker** com os arquivos: `npx supabase db reset` (apaga dados locais) ou aplicar migrações conforme a [documentação CLI](https://supabase.com/docs/guides/cli/local-development).

## Link e login

Se `migration list` falhar com auth:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

O `project_ref` é o subdomínio de `https://<PROJECT_REF>.supabase.co`.
