import { useInView } from "@/hooks/useInView";
import { TrendingUp, Users, DollarSign } from "lucide-react";

export default function Cases() {
  const { ref, inView } = useInView();

  return (
    <section id="cases" ref={ref} className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Cases de <span className="text-primary">Sucesso</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Resultados reais de empresas que transformaram seu marketing com a ConversaHub.
          </p>
        </div>

        <div className={`max-w-4xl mx-auto bg-card border rounded-3xl p-8 md:p-12 shadow-lg transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="flex flex-col md:flex-row md:items-center gap-8">
            <div className="flex-1 space-y-4">
              <div className="inline-block bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">
                E-commerce de Moda
              </div>
              <h3 className="text-2xl font-bold">ModaFit aumentou o faturamento em 340% com marketing no WhatsApp</h3>
              <p className="text-muted-foreground">
                Em apenas 6 meses, a ModaFit triplicou sua base de clientes recorrentes usando campanhas automatizadas e chatbot inteligente da ConversaHub.
              </p>
            </div>
            <div className="flex md:flex-col gap-6 md:gap-8">
              {[
                { icon: DollarSign, value: "R$ 2.4M", label: "Faturamento gerado" },
                { icon: Users, value: "15K", label: "Clientes fidelizados" },
                { icon: TrendingUp, value: "18x", label: "ROI da plataforma" },
              ].map(({ icon: Icon, value, label }) => (
                <div key={label} className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xl font-bold text-primary">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
