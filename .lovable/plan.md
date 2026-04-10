

# Correção: Erros de lint `@typescript-eslint/no-explicit-any`

O CI falhou porque 20 usos de `any` foram detectados em 4 arquivos. A correção é substituir cada `any` por tipos específicos.

## Arquivos e correções

### 1. `src/pages/dashboard/Integracoes.tsx` (2 erros)
- **L172**: `onError: (err: any)` → `onError: (err: Error)`
- **L296**: `(item as any).isComingSoon` → tipagem correta do item (adicionar `isComingSoon` ao tipo do array ou usar type guard)

### 2. `supabase/functions/fetch-store-metrics/index.ts` (6 erros)
- **L35, L78, L113, L140, L172**: callbacks de `.reduce()` com `o: any` → usar interfaces tipadas:
  ```typescript
  interface ShopifyOrder { total_price?: string }
  interface NuvemshopOrder { total?: string }
  interface WooOrder { total?: string }
  interface TrayOrder { Order?: { total?: string } }
  interface VTEXOrder { totalValue?: number }
  ```
- **L242**: `catch (err: any)` → `catch (err: unknown)` com cast `(err as Error).message`

### 3. `supabase/functions/send-sms/index.ts` (2 erros)
- **L68**: `let data: any` → `let data: Record<string, unknown>`
- **L110**: `catch (err: any)` → `catch (err: unknown)`

### 4. `supabase/functions/validate-integration/index.ts` (10 erros)
- **L22, L42, L60, L74, L91, L106, L119, L135, L158**: todos `catch (e: any)` → `catch (e: unknown)` com `(e as Error).message`
- **L199**: `catch (err: any)` → `catch (err: unknown)`

## Resumo
- Substituir `catch (x: any)` por `catch (x: unknown)` + cast `(x as Error).message` (20 ocorrências nos 4 arquivos)
- Criar interfaces para os objetos de pedidos no `fetch-store-metrics`
- Tipar `data` no `send-sms`
- Corrigir cast `as any` no `Integracoes.tsx`
- Re-deploy das 3 Edge Functions após correção

