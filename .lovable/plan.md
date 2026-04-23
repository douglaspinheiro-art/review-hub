

# Plano: Dashboard de Telemetria `diagnostic_generated`

Página admin-only para visualizar a saúde da geração de diagnósticos a partir dos eventos já gravados em `funnel_telemetry_events` (event_name = `diagnostic_generated`, gravados pela `Analisando.tsx`).

## Onde fica
Nova rota `/admin/diagnostico-telemetria`, protegida por `AdminStaffRoute` (já existe). Link adicionado no `Admin.tsx`.

## Métricas exibidas (período: últimos 7d / 30d, toggle)

**KPIs (4 cards no topo):**
- Total de diagnósticos gerados
- % fallback (`metadata.fallback_mode = true`)
- % com parse retry (`metadata.parse_retry = true`)
- Tempo médio (`metadata.total_ms`) + p95

**Gráficos (Recharts):**
- Linha: volume diário (últimos 30d)
- Barra: distribuição de `payload_completeness_pct` em buckets (0-25, 26-50, 51-75, 76-100)
- Barra horizontal: top 8 `enriched_fields` mais frequentes (quais campos opcionais estão chegando)

**Tabela (últimos 50):**
Colunas: data | completude | tempo (ms) | fallback | parse_retry | enriched count | error_message (se houver)

## Arquivos
- `src/pages/admin/DiagnosticoTelemetria.tsx` — página nova
- `src/hooks/useDiagnosticTelemetry.ts` — TanStack Query hook que faz select em `funnel_telemetry_events` filtrando `event_name='diagnostic_generated'` + range de data
- `src/App.tsx` — registrar rota dentro de `AdminStaffRoute`
- `src/pages/admin/Admin.tsx` — adicionar card/link

## Acesso
- RLS já permite admin via `has_role(auth.uid(), 'admin')` na policy `funnel_telemetry_select_own_or_admin` — sem migrations necessárias.

## Fora de escopo
- Filtro por loja (todos eventos são globais agregados; admin vê tudo).
- Export CSV (futuro).
- Alertas automáticos (futuro).

