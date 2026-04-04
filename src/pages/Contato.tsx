import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mail, Phone, Clock } from "lucide-react";

export default function Contato() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Fale com a <span className="text-primary">LTV Boost</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Nossa equipe está pronta para ajudar você a transformar seu WhatsApp em uma máquina de vendas.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Formulário */}
            <div className="bg-card border rounded-3xl p-8">
              <h2 className="text-2xl font-bold mb-6">Envie uma mensagem</h2>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Nome</label>
                    <input
                      type="text"
                      placeholder="Seu nome"
                      className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Empresa</label>
                    <input
                      type="text"
                      placeholder="Nome da empresa"
                      className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">E-mail</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">WhatsApp</label>
                  <input
                    type="tel"
                    placeholder="(11) 99999-9999"
                    className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Assunto</label>
                  <select className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Selecione um assunto</option>
                    <option>Quero agendar uma demo</option>
                    <option>Tenho dúvidas sobre a plataforma</option>
                    <option>Suporte técnico</option>
                    <option>Parceria comercial</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Mensagem</label>
                  <textarea
                    rows={4}
                    placeholder="Conte como podemos ajudar..."
                    className="w-full px-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full">
                  Enviar mensagem
                </Button>
              </form>
            </div>

            {/* Canais de contato */}
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Outros canais</h2>
                <p className="text-muted-foreground">Prefere falar diretamente? Escolha o canal mais conveniente.</p>
              </div>

              <div className="space-y-4">
                <div className="bg-card border rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">WhatsApp</p>
                    <p className="text-sm text-muted-foreground mb-2">Resposta em até 1 hora útil</p>
                    <Button asChild size="sm" variant="outline">
                      <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer">
                        Abrir conversa
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="bg-card border rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">E-mail</p>
                    <p className="text-sm text-muted-foreground mb-1">contato@LTV Boost.com.br</p>
                    <p className="text-xs text-muted-foreground">Resposta em até 24 horas úteis</p>
                  </div>
                </div>

                <div className="bg-card border rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Telefone</p>
                    <p className="text-sm text-muted-foreground mb-1">(11) 3000-0000</p>
                    <p className="text-xs text-muted-foreground">Seg–Sex, 9h às 18h</p>
                  </div>
                </div>

                <div className="bg-card border rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Horário de atendimento</p>
                    <p className="text-sm text-muted-foreground">Segunda a Sexta: 9h às 18h (BRT)</p>
                    <p className="text-sm text-muted-foreground">Sábados: 9h às 13h (WhatsApp)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
