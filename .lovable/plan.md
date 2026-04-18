

User wants ability to manually add contacts on `/dashboard/integracoes`. Let me check the page first.
<lov-tool-use id="toolu_vrtx_01TwEZ4Lf4E3sbz7NcsEhJ3N" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/dashboard/Integracoes.tsx\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01UT1eHKagFiZSk8sCeUrPrq" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/dashboard/Integracoes.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>
I have enough context. The `/dashboard/integracoes` page is the integrations catalog. The user wants to add contacts manually from there. There's already a `ContactModal` component (used in `/dashboard/contatos`). I'll add a "Contatos" section/card on the Integracoes page that opens the existing ContactModal — minimal and consistent.

<lov-plan>
## Objetivo
Adicionar a opção de cadastrar contatos manualmente diretamente em `/dashboard/integracoes`, sem precisar navegar até `/dashboard/contatos`.

## Abordagem
Reaproveitar o componente já existente `src/components/dashboard/ContactModal.tsx` (mesmo modal usado em Contatos), adicionando uma nova seção no topo da página de Integrações com dois CTAs:

1. **"Adicionar contato manual"** → abre o `ContactModal` (cadastro 1-a-1)
2. **"Importar em massa (CSV/JSON)"** → link para `/dashboard/contatos` (já existe fluxo de import via `bulk-import-contacts`)

## Mudanças no código
**Arquivo único:** `src/pages/dashboard/Integracoes.tsx`
- Importar `ContactModal` e `useState` para controle de abertura.
- Inserir um card/seção logo abaixo do header da página, antes do grid de catálogo, com título "Contatos" e os dois botões.
- Renderizar `<ContactModal onClose={...} />` condicionalmente.

Nada de migrations, edge functions ou novas tabelas — o `ContactModal` já faz o `INSERT` em `contacts` com RLS por `user_id` corretamente.

## Layout (resumo)
```
[ Header Integrações ]
┌─────────────────────────────────────────┐
│  Contatos                               │
│  Adicione manualmente ou importe CSV    │
│  [+ Adicionar contato]  [Importar CSV] │
└─────────────────────────────────────────┘
[ Grid de catálogo de integrações ... ]
```

## O que NÃO muda
- Modal de contato (já testado, normaliza telefone para E.164 BR).
- Página `/dashboard/contatos` continua sendo o lugar canônico para listagem/busca/import em massa.
- RLS e schema da tabela `contacts`.
