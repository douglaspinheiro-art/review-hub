import { forwardRef } from "react";
import { MessageCircle } from "lucide-react";

const links: Record<string, { label: string; href: string }[]> = {
  Produto: [
    { label: "Soluções", href: "/#solucoes" },
    { label: "Integrações", href: "/api#integrations" },
    { label: "Planos", href: "/#planos" },
    { label: "API", href: "/api" },
  ],
  Empresa: [
    { label: "Sobre nós", href: "/sobre" },
    { label: "Carreiras", href: "/carreiras" },
    { label: "Blog", href: "/blog" },
    { label: "Contato", href: "/contato" },
  ],
  Recursos: [
    { label: "Central de Ajuda", href: "/ajuda" },
    { label: "Documentação", href: "/documentacao" },
    { label: "Status", href: "/status" },
    { label: "Calculadora", href: "/calculadora" },
  ],
  Legal: [
    { label: "Termos de Uso", href: "/termos" },
    { label: "Privacidade", href: "/privacidade" },
    { label: "LGPD", href: "/lgpd" },
  ],
};

const Footer = forwardRef<HTMLElement>(function Footer(_props, ref) {
  return (
    <footer ref={ref} className="border-t border-border/50 py-16">

    <footer className="border-t border-border/50 py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-10 mb-12">
          <div className="md:col-span-1 space-y-4">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center">
                <MessageCircle className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg">LTV Boost</span>
            </a>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A plataforma completa de marketing conversacional com IA para e-commerces brasileiros.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
              Todos os sistemas operacionais
            </div>
          </div>
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} LTV Boost. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4 text-xs">
            <span className="bg-secondary/50 px-3 py-1 rounded-full">🇧🇷 Feito no Brasil</span>
            <span className="bg-secondary/50 px-3 py-1 rounded-full">LGPD Compliant</span>
          </div>
        </div>
      </div>
    </footer>
});

export default Footer;
