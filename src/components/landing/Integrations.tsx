import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

const integrations = [
  "Shopify", "Nuvemshop", "VTEX", "WooCommerce", "Dizy Commerce", "Tray",
  "Magento", "Stripe", "PagSeguro", "Bling", "SAP",
  "RD Station", "HubSpot", "Salesforce", "Google Ads", "Meta Ads",
];

export default function Integrations() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className={cn(
          "text-center max-w-2xl mx-auto mb-12 transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">Integrações</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            <span className="text-gradient">40+</span> integrações nativas
          </h2>
          <p className="text-muted-foreground text-lg">
            Conecte com os principais e-commerces, ERPs, CRMs e gateways do Brasil.
          </p>
        </div>

        <div className={cn(
          "flex flex-wrap justify-center gap-3 max-w-3xl mx-auto transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {integrations.map((name, idx) => (
            <div
              key={name}
              className="px-5 py-2.5 rounded-xl bg-secondary/50 border border-border/30 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
              style={{ transitionDelay: `${idx * 30}ms` }}
            >
              {name}
            </div>
          ))}
          <div className="px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
            + 25 mais
          </div>
        </div>
      </div>
    </section>
  );
}
