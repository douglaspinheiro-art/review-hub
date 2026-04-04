import { TrendingUp } from "lucide-react";

const items = [
  "🔥 +R$2.3M gerados esta semana",
  "⚡ 847 campanhas disparadas hoje",
  "🎯 Taxa de abertura média: 94%",
  "💰 ROI médio dos clientes: 12x",
  "📈 +340% em vendas recorrentes",
];

export default function TickerBar() {
  return (
    <div className="bg-primary/10 border-b border-primary/20 py-1.5 overflow-hidden">
      <div className="flex animate-ticker gap-12 w-max">
        {[...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs font-medium text-primary whitespace-nowrap">
            <TrendingUp className="w-3 h-3" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
