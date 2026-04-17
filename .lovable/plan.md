
User says: in step 3, only "clientes ativos" (active customers) is being shown — wants to know what data comes from the connection and why other fields are empty.

Let me check the Onboarding step 3 to see what's displayed and what `fetch-store-metrics` returns vs what step 3 renders.

From the edge `fetch-store-metrics/index.ts`, it returns:
- `plataforma`
- `faturamento` (revenue, last 30d)
- `ticketMedio` (average order value)
- `totalClientes` (total customers)
- `taxaAbandono` (cart abandonment rate)

So 4 metrics + platform name. The user says only "clientes ativos" appeared — meaning `totalClientes` populated but `faturamento`, `ticketMedio`, `taxaAbandono` did not show up in the UI.

Need to view Onboarding.tsx step 3 to see why.
