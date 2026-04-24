import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { BarChart3, ShieldCheck, Eye, Quote, ShoppingBag } from "lucide-react";

export default function ClosedLoopProof() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-24 md:py-28 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "max-w-2xl mx-auto text-center mb-12 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <p className="text-primary font-semibold text-sm mb-3 uppercase tracking-widest">
            Prova do loop
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Você audita a receita no <span className="text-gradient">seu próprio GA4</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Não somos um dashboard paralelo. Cada campanha LTV Boost aparece no Google Analytics da sua loja com UTM
            própria — pronta para o seu time de mídia conferir.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Mock GA4 */}
          <div
            className={cn(
              "bg-card border border-border/50 rounded-2xl p-6 shadow-xl transition-all duration-700",
              inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
            )}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-bold">Google Analytics 4 · sua loja</span>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Aquisição · 30d
              </span>
            </div>

            <div className="rounded-xl border border-border/40 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-secondary/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Source / Medium</span>
                <span className="text-right">Sessions</span>
                <span className="text-right">Revenue</span>
              </div>
              {[
                { src: "google / organic", s: "12.481", r: "R$ 38.420" },
                { src: "ltvboost / winback_whatsapp", s: "847", r: "R$ 9.140", highlight: true },
                { src: "ltvboost / cart_recovery_email", s: "1.203", r: "R$ 6.880", highlight: true },
                { src: "facebook / cpc", s: "9.327", r: "R$ 24.110" },
                { src: "(direct) / (none)", s: "5.812", r: "R$ 14.220" },
              ].map((row) => (
                <div
                  key={row.src}
                  className={cn(
                    "grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-sm border-t border-border/40",
                    row.highlight && "bg-primary/5"
                  )}
                >
                  <span className={cn("truncate", row.highlight && "font-bold text-primary")}>
                    {row.src}
                  </span>
                  <span className="text-right font-mono text-xs">{row.s}</span>
                  <span
                    className={cn(
                      "text-right font-mono text-xs",
                      row.highlight ? "text-primary font-bold" : "text-muted-foreground"
                    )}
                  >
                    {row.r}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
              UTMs próprias <span className="font-mono text-foreground/80">utm_source=ltvboost</span> aparecem
              direto no relatório de aquisição do seu GA4.
            </p>
          </div>

          {/* Bullets + quote */}
          <div
            className={cn(
              "space-y-5 transition-all duration-700",
              inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6"
            )}
          >
            {[
              {
                icon: ShoppingBag,
                title: "Validado em dois lugares",
                desc: "Conversão confirmada no evento purchase do GA4 E no pedido paid da sua plataforma (Shopify, Nuvemshop, VTEX, etc.). Sem dupla contagem, sem dado órfão.",
              },
              {
                icon: Eye,
                title: "Você vê no SEU GA4",
                desc: "Sem abrir um segundo dashboard. A receita aparece no mesmo relatório que seu time já usa.",
              },
              {
                icon: ShieldCheck,
                title: "Time de mídia audita junto",
                desc: "Agência, in-house e financeiro conferem a mesma fonte de verdade. Discussão de atribuição acaba.",
              },
              {
                icon: BarChart3,
                title: "Sem caixa-preta de atribuição",
                desc: "Não inventamos pixel próprio nem janela mágica. Usamos o modelo de atribuição que você já configurou.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 p-5 rounded-xl bg-card border border-border/50"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <Quote className="w-6 h-6 text-primary/40 mb-2" />
              <p className="text-sm leading-relaxed text-foreground/90 italic">
                "Finalmente parei de discutir atribuição com a agência. A receita que a LTV Boost gera aparece no
                mesmo GA4 que eles olham todo dia."
              </p>
              <p className="text-xs text-muted-foreground mt-3 font-semibold">
                — Marina S., Head de E-commerce, Beleza
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}