import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const links: Record<string, { label: string; href: string }[]> = {
  Produto: [
    { label: "Soluções", href: "/#solucoes" },
    { label: "Integrações", href: "/api#integrations" },
    { label: "Planos", href: "/#planos" },
    { label: "API", href: "/api" },
  ],
  Empresa: [
    { label: "Dossiês", href: "/#cases" },
    { label: "Sobre", href: "/sobre" },
    { label: "Blog", href: "/blog" },
    { label: "Carreiras", href: "/carreiras" },
  ],
  Suporte: [
    { label: "Central de Ajuda", href: "/central-de-ajuda" },
    { label: "Documentação", href: "/documentacao" },
    { label: "Status", href: "/status" },
    { label: "Contato", href: "/contato" },
  ],
  Legal: [
    { label: "Privacidade", href: "/privacidade" },
    { label: "Termos", href: "/termos" },
    { label: "LGPD", href: "/lgpd" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-border/10 bg-muted/20 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-6 gap-12 mb-16">
          <div className="md:col-span-2">
            <a href="/" className="flex items-center gap-3 font-black text-xl mb-6 font-syne tracking-tighter uppercase">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary-foreground fill-primary-foreground" />
              </div>
              LTV Boost
            </a>
            <p className="text-sm text-muted-foreground/70 leading-relaxed max-w-xs">
              A camada de inteligência de receita e LTV que os e-commerces de elite usam para escalar sem queimar caixa.
            </p>
          </div>
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="font-black text-[10px] uppercase tracking-[0.2em] mb-6 text-foreground/80">{title}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
          <div>© {new Date().getFullYear()} LTV Boost Intelligence. Operação de Elite.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-primary transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-primary transition-colors">Instagram</a>
            <a href="#" className="hover:text-primary transition-colors">Twitter (X)</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
