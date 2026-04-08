# Estratégia de redução da dívida de lint

O CI usa `npm run lint:changed` (somente arquivos alterados no PR) para evitar bloqueio por código legado. O objetivo deste documento é voltar gradualmente ao `eslint .` completo no CI sem parar entregas.

## Estado atual

- **`npm run lint`**: escaneia o repositório inteiro (`eslint .`). Útil localmente e para baseline.
- **`npm run lint:changed`**: usado no GitHub Actions; evita regressão em arquivos tocados.
- **`npm run lint:stats`**: imprime contagem de erros e avisos (saída JSON) para acompanhar evolução sem interpretar logs longos.

## Fases sugeridas

### Fase 0 — Congelar regressão (já feita)

- CI com `lint:changed` + smoke checks + testes de negócio críticos.

### Fase 1 — Diretórios “verdes” (2–4 sprints)

Escolha um diretório pequeno ou crítico e zere erros nele; depois inclua no gate completo opcional:

1. Rodar `npm run lint` e filtrar por pasta, por exemplo `src/components/__tests__`, `src/lib` ou um único módulo.
2. Corrigir ou suprimir de forma localizada (com comentário `eslint-disable-next-line` só onde o custo de tipagem for alto).
3. Repetir até a pasta ficar limpa.

Meta sugerida: **1 pasta por sprint**, ou **~20–30 erros** por sprint se preferir contagem.

### Fase 2 — Gate progressivo no CI (opcional)

Quando o número total de erros cair abaixo de um teto (ex.: 50):

- Trocar o job de lint no CI de `lint:changed` para `eslint .` **ou**
- Manter os dois: `lint:changed` obrigatório + job `lint:full` que falha se `errors > N` (N reduzido a cada sprint).

### Fase 3 — `eslint .` obrigatório no CI

Quando `npm run lint` passar com **0 erros** (avisos podem permanecer temporariamente com regra explícita):

- Atualizar `.github/workflows/ci.yml` para usar `npm run lint` no passo de lint.
- Remover ou manter `lint:changed` apenas como conveniência local (`git pre-push`).

## Comandos úteis

| Comando | Uso |
|---------|-----|
| `npm run lint` | Baseline completo (local / release) |
| `npm run lint:changed` | Igual ao CI; só arquivos alterados |
| `npm run lint:stats` | Métrica rápida de erros/avisos |

## Priorização

1. Código em rotas de auth, billing e multi-tenant.
2. Hooks e libs compartilhadas (`src/hooks`, `src/lib`).
3. Páginas de dashboard com maior tráfego.
4. Componentes de marketing com menor risco operacional.

## Referência

- Configuração: [eslint.config.js](../eslint.config.js)
- CI: [.github/workflows/ci.yml](../.github/workflows/ci.yml)
