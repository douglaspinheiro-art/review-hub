import { useInView } from "@/hooks/useInView";
import {
  ShoppingCart, Store, CreditCard, Package, Truck,
  Database, Cloud, BarChart, Settings, Globe,
  Smartphone, Wallet, Receipt, Building, Network,
} from "lucide-react";

const integrations = [
  { icon: ShoppingCart, label: "Shopify" },
  { icon: Store, label: "WooCommerce" },
  { icon: CreditCard, label: "Stripe" },
  { icon: Package, label: "Nuvemshop" },
  { icon: Truck, label: "Melhor Envio" },
  { icon: Database, label: "Vtex" },
  { icon: Cloud, label: "Salesforce" },
  { icon: BarChart, label: "RD Station" },
  { icon: Settings, label: "HubSpot" },
  { icon: Globe, label: "Magento" },
  { icon: Smartphone, label: "Tray" },
  { icon: Wallet, label: "PagSeguro" },
  { icon: Receipt, label: "Bling" },
  { icon: Building, label: "SAP" },
  { icon: Network, label: "API Rest" },
];

export default function Integrations() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-20 md:py-28 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-primary">40+</span> integrações nativas
          </h2>
          <p className="text-muted-foreground text-lg">
            Conecte com os principais e-commerces, ERPs, CRMs e gateways de pagamento.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-6 max-w-3xl mx-auto">
          {integrations.map(({ icon: Icon, label }, idx) => (
            <div
              key={label}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-card hover:shadow-sm transition-all duration-500 ${inView ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
              style={{ transitionDelay: `${idx * 30}ms` }}
            >
              <div className="w-14 h-14 rounded-full bg-card border shadow-sm flex items-center justify-center">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
