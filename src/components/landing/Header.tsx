import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, MessageCircle, ArrowRight } from "lucide-react";

const navLinks = [
  { label: "Soluções", href: "#solucoes" },
  { label: "Como Funciona", href: "#como-funciona" },
  { label: "Cases", href: "#cases" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-2xl border-b border-border/50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-primary/30 transition-all">
            <MessageCircle className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg">LTV Boost</span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href="/login">Entrar</a>
          </Button>
          <Button asChild size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
            <a href="/signup">
              Agendar Demo <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <nav className="flex flex-col gap-4 mt-8">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-base font-medium py-2">
                  {l.label}
                </a>
              ))}
              <Button asChild variant="ghost" className="w-full justify-start">
                <a href="/login" onClick={() => setOpen(false)}>Entrar</a>
              </Button>
              <Button asChild className="w-full">
                <a href="/signup" onClick={() => setOpen(false)}>Agendar Demo</a>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
