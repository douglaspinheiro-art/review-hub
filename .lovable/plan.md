

## Resposta direta

Olhando seu screenshot: você está com **"TEMPLATE APROVADO"** selecionado (card destacado em verde) e o template `hello_world - en_US` escolhido.

**Será enviado o TEMPLATE APROVADO** (`hello_world`), com o texto:
> "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us."

**O texto que você escreveu** ("Oi {{nome}}! Aqui é o Douglas...") **será IGNORADO** porque, quando "Template Aprovado" está ativo, o worker (`process-scheduled-messages`) chama `sendTemplate` com o nome do template e seus parâmetros — o conteúdo do textarea só é usado quando o tipo é "Texto Livre (24h)".

## Por que isso acontece

O texto do template é **fixo na Meta** — foi o que eles aprovaram. Você só pode:
1. Escolher qual template usar
2. Preencher as variáveis `{{1}}`, `{{2}}`... que o template define no corpo

O `hello_world` é um template padrão da Meta **sem variáveis** e em **inglês** — por isso não tem onde encaixar seu "Oi {{nome}}".

## Problema de UX detectado

A UI está confusa: mostra dois conteúdos diferentes ao mesmo tempo (textarea livre em cima + template embaixo) sem deixar claro qual vence. Vou propor melhorias:

### Plano de ajuste de clareza na UI

1. **Esconder/desabilitar o textarea livre** quando "Template Aprovado" estiver selecionado
   - Substituir por um aviso: "✓ Será enviado o template aprovado abaixo. O texto livre não se aplica."
2. **Esconder a biblioteca de templates salvos e o botão "Gerar variação A/B"** no modo Template (eles só fazem sentido para texto livre)
3. **Destacar a pré-visualização** como "✉️ Mensagem que o cliente vai receber" em verde, deixando óbvio que é o conteúdo final
4. **Avisar sobre o template `hello_world`**: ele é em inglês e serve só para teste. Adicionar dica: "💡 Crie templates em português no Meta Business Manager para campanhas reais"
5. **Para usar variáveis com nome do cliente**: você precisa criar um template no Meta Business Manager tipo:
   > "Olá {{1}}! Aqui é a {{2}}, temos uma oferta especial..."
   
   Aí no LTV Boost você preencheria `{{1}}` = `{{nome}}` (do contato) e `{{2}}` = "LTV Boost"

## Arquivos afetados

- `src/components/dashboard/CampaignModal.tsx` — esconder textarea/biblioteca/A-B quando modo = template; reorganizar ordem visual (toggle no topo, conteúdo abaixo)

## Resultado esperado

Ao escolher "Template Aprovado", a tela mostra **apenas** o seletor de template + variáveis + preview — sem textarea solto causando confusão sobre qual mensagem é enviada.

Quer que eu aplique esses ajustes de UX?

