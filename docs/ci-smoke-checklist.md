# CI Smoke Checklist

Use este checklist para evitar regressões de runtime (ex.: `ReferenceError` por import faltando) nos fluxos principais.

## Pipeline mínima

- Executar `npm run test:smoke-ui`
- Executar `npm run test`
- Executar `npx tsc --noEmit`
- Executar `npm run build`

Atalho único:

- `npm run ci:smoke`

## Cobertura esperada dos smoke tests

- Render do `Dashboard` sem exceção em runtime.
- Import dos módulos críticos:
  - `Inbox`
  - `Campanhas`
  - `WhatsApp`
  - `ConvertIQDiagnostico`
  - `ConvertIQPlano`

## Sinais de bloqueio para merge

- Qualquer `ReferenceError` em render de página principal.
- Falha de `tsc` por símbolo não definido/import ausente.
- Falha de build Vite.
- Falha nos testes de negócio/rotas protegidas.

