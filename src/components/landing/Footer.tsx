import { MessageCircle } from "lucide-react";

const links: Record<string, { label: string; href: string }[]> = {
  Produto: [
    { label: "Soluções", href: "/#solucoes" },
    { label: "Integrações", href: "/api#integrations" },
    { label: "Planos", href: "/#planos" },
    { label: "API", href: "/api" },
  ],
  Empresa: [
    { label: "Sobre", href: "/sobre" },
    { label: "Cases", href: "/#cases" },
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
    { label: "Termos de Uso", href: "/termos" },
    { label: "LGPD", href: "/lgpd" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-8 mb-12">
          <div className="md:col-span-1">
            <a href="/" className="flex items-center gap-2 font-bold text-lg mb-4">
              <MessageCircle className="h-6 w-6 text-primary" />
              LTV Boost
            </a>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A plataforma completa de marketing conversacional com IA para e-commerces.
            </p>
          </div>
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-3">{title}</h4>
              <ul className="space-y-2">
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
        <div className="border-t pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} LTV Boost. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
