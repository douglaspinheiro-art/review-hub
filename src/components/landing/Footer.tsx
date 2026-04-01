import { MessageCircle } from "lucide-react";

const links = {
  Produto: ["Soluções", "Integrações", "Planos", "API"],
  Empresa: ["Sobre", "Cases", "Blog", "Carreiras"],
  Suporte: ["Central de Ajuda", "Documentação", "Status", "Contato"],
  Legal: ["Privacidade", "Termos de Uso", "LGPD"],
};

export default function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-5 gap-8 mb-12">
          <div className="md:col-span-1">
            <a href="#" className="flex items-center gap-2 font-bold text-lg mb-4">
              <MessageCircle className="h-6 w-6 text-primary" />
              ConversaHub
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
                  <li key={item}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} ConversaHub. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
