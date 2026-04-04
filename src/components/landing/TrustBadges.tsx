import { useInView } from "@/hooks/useInView";
import { Shield, Clock, HeadphonesIcon, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

const badges = [
  { icon: Shield, title: "LGPD Compliant", desc: "Dados criptografados e em conformidade total" },
  { icon: Clock, title: "99.9% Uptime", desc: "Infraestrutura redundante e monitorada 24/7" },
  { icon: HeadphonesIcon, title: "Suporte em < 2h", desc: "Time dedicado via WhatsApp e e-mail" },
  { icon: Unlock, title: "Sem Lock-in", desc: "Exporte seus dados a qualquer momento" },
];

export default function TrustBadges() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-16">
      <div className="container mx-auto px-4">
        <div className={cn(
          "grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto transition-all duration-700",
          inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          {badges.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border/30">
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
