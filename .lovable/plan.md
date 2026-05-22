# Design System Pack — LTV Boost → ViaX

Vou gerar um pacote portátil em `/mnt/documents/ltvboost-design-system/` que você baixa e cola no ViaX. Nenhum arquivo deste projeto (LTV Boost) será alterado.

## O que vai no pack

```
ltvboost-design-system/
├── README.md                  Instruções passo-a-passo de instalação no ViaX
├── index.css                  Tokens HSL (dark + light) + animações + utilitários
├── tailwind.config.ts         Cores semânticas, fontFamily, radius, keyframes
├── components.json            Config shadcn/ui (style "default", base "slate")
├── DESIGN-TOKENS.md           Referência das cores, fontes, espaçamentos
└── COMPONENT-GUIDE.md         Padrões: MetricCard, FunnelBar, SeverityBadge, ChannelIcon, RFMBadge, OpportunityCard, QuickWinBanner, AILoadingOverlay
```

## Identidade capturada (resumo)

- **Tema:** dark-first (background `220 25% 6%`), light opcional
- **Primary:** emerald `160 84% 39%` (#10B981) — CTAs e accents
- **Tipografia:** Inter (corpo) + Plus Jakarta Sans (display) + JetBrains Mono (números/KPIs)
- **Radius:** 0.75rem
- **Sidebar:** tokens próprios (fundo `220 25% 8%`)
- **Animações:** `fade-up`, `float`, `shimmer`, `pulse-dot`, `word-rotate`, `scroll-left`, `ticker-scroll`
- **Utilitário marcante:** `.text-gradient` (primary → emerald-400)

## Como você usa no ViaX

1. Baixar os artefatos
2. Substituir `src/index.css`, `tailwind.config.ts`, `components.json` no ViaX
3. Garantir que `tailwindcss-animate` está instalado (`npm i tailwindcss-animate`)
4. Seguir `COMPONENT-GUIDE.md` para recriar os componentes-padrão (são pequenos e descritos com snippets prontos)

## Observação técnica

- Os componentes shadcn/ui em `src/components/ui/*` são gerados pela CLI do shadcn no ViaX — não precisam ser copiados, basta rodar `npx shadcn@latest add button card badge ...` lá e eles vão herdar os tokens automaticamente.
- Logos/imagens específicas do LTV Boost **não** entram (não fazem parte da identidade replicável). Se quiser também a logo, me avise.

Aprove para eu gerar o pack.
