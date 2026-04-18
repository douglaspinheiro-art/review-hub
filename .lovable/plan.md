
O usuário colou um **token temporário de teste** da Meta (de "Gerar token de acesso" no painel WhatsApp) + o **Phone Number ID** `1003067482898885`.

## Diagnóstico

Não, essas informações **não são adequadas** para uso em produção do jeito que estão:

### 1. O token é temporário (válido por 24h)
O botão "Gerar token de acesso" no painel da Meta gera um token que expira em **24 horas**. Para a aplicação funcionar continuamente você precisa de um destes:

- **Token de Sistema (System User Token)** — permanente, recomendado para produção
- **Token via Embedded Signup (OAuth)** — long-lived (60 dias) com refresh automático, que é o fluxo que a função `meta-wa-oauth` já implementa

### 2. Faltam dados obrigatórios
Para a conexão Meta Cloud funcionar você precisa de **3 IDs**, não apenas 2:
- ✅ Phone Number ID: `1003067482898885`
- ❌ WABA ID (WhatsApp Business Account ID): `2161510034688293` (vi na sua imagem anterior)
- ❌ Access Token (precisa ser permanente)

## Caminho recomendado

**Opção A (produção, recomendada):** Usar o botão **"Conectar com Meta"** na tela `/dashboard/whatsapp` que dispara o Embedded Signup. Isso preenche tudo automaticamente e mantém o token vivo via refresh.

**Opção B (teste rápido por 24h):** Inserir manualmente os 3 valores (token + phone_number_id + waba_id) no formulário de configuração avançada. Funciona para testar envios hoje, mas para de funcionar amanhã.

**Opção C (produção alternativa):** Gerar um **System User Token permanente** no Meta Business Manager → Configurações do Negócio → Usuários do Sistema → criar usuário "Admin" → gerar token com permissões `whatsapp_business_messaging` + `whatsapp_business_management`. Esse token nunca expira.

## Pergunta

Qual caminho você quer seguir? Posso:
1. Te guiar pelo Embedded Signup (Opção A)
2. Adicionar um campo no UI para colar o token temporário e testar agora (Opção B)
3. Te dar o passo-a-passo para gerar o System User Token (Opção C)

Não vou fazer alterações de código até você escolher.
