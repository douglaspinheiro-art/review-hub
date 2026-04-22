import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import MercadoPagoCheckoutModal, { type CheckoutRequest } from "@/components/checkout/MercadoPagoCheckoutModal";

interface Ctx {
  open: (req: CheckoutRequest) => void;
}

const CheckoutCtx = createContext<Ctx | null>(null);

export function MercadoPagoCheckoutProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CheckoutRequest | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((req: CheckoutRequest) => {
    setRequest(req);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <CheckoutCtx.Provider value={value}>
      {children}
      <MercadoPagoCheckoutModal
        open={isOpen}
        onOpenChange={(v) => {
          setIsOpen(v);
          if (!v) setTimeout(() => setRequest(null), 200);
        }}
        request={request}
      />
    </CheckoutCtx.Provider>
  );
}

export function useMercadoPagoCheckout(): Ctx {
  const ctx = useContext(CheckoutCtx);
  if (!ctx) throw new Error("useMercadoPagoCheckout deve estar dentro de <MercadoPagoCheckoutProvider>");
  return ctx;
}