
## Diagnóstico

No modal "Nova Campanha" (`src/components/dashboard/CampaignModal.tsx`), o passo 0 valida `name`, `channel` e `objective` via `trigger([...])`. O schema Zod exige `name` com mínimo 3 caracteres. Se o usuário clica em **Próximo** sem preencher um nome válido (≥3 chars), `trigger` retorna `false` e o `setStep` não é chamado — mas:

- `errors` **nunca é extraído** do `formState` (linha 270 só pega `isDirty`)
- nenhum erro inline é renderizado abaixo do input
- nenhum toast é disparado

Resultado: o botão "não faz nada" do ponto de vista do usuário, quando na verdade a validação falhou em silêncio.

## Correção

**Arquivo único:** `src/components/dashboard/CampaignModal.tsx`

1. Extrair `errors` de `formState` no `useForm`.
2. Em `nextStep` (passo 0), quando `trigger` falhar, disparar um `toast` destrutivo apontando o primeiro erro (ex.: "Informe um nome com pelo menos 3 caracteres") — mesmo padrão usado em outros pontos do modal (`toast({ title, variant: "destructive" })`).
3. Aplicar o mesmo tratamento ao passo da mensagem (step `STEP_MENSAGEM`), onde `trigger(["message"])` também pode falhar silenciosamente.
4. (Opcional/baixo custo) Mostrar mensagem de erro inline abaixo do `Input` de nome em `CampaignObjectiveStep.tsx`, recebendo `errors` via `useFormContext`.

## O que NÃO muda

- Schema Zod, fluxo de envio, RPCs e edge functions permanecem iguais.
- Estilo/layout do modal não é alterado.

## Resultado esperado

Ao clicar em **Próximo** sem nome válido: aparece toast "Informe um nome com pelo menos 3 caracteres" e (se aplicado o item 4) um texto vermelho abaixo do campo. O botão volta a ter feedback claro.
