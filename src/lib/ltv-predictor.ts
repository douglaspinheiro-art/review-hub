/**
 * LTV Predictor Intelligence
 * Calcula a probabilidade de um cliente comprar novamente com base no histórico.
 */

export interface OrderHistory {
  date: string;
  amount: number;
}

export interface PredictionResult {
  nextOrderDays: number; // Dias estimados para a próxima compra
  probability: number;   // Probabilidade (0-1)
  recommendedAction: string;
}

export function predictNextOrder(orders: OrderHistory[]): PredictionResult {
  if (orders.length < 2) {
    return {
      nextOrderDays: 30, // Default para novos clientes
      probability: 0.3,
      recommendedAction: "Enviar oferta de boas-vindas para incentivar a 2ª compra."
    };
  }

  // Ordenar por data
  const sorted = [...orders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Calcular intervalo médio entre pedidos em dias
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = new Date(sorted[i].date).getTime() - new Date(sorted[i-1].date).getTime();
    intervals.push(diff / (1000 * 3600 * 24));
  }
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const lastOrderDate = new Date(sorted[sorted.length - 1].date);
  const daysSinceLastOrder = (Date.now() - lastOrderDate.getTime()) / (1000 * 3600 * 24);

  // Lógica de recomendação
  let probability = 0.5;
  if (daysSinceLastOrder > avgInterval * 1.2) {
    probability = 0.8; // Está "atrasado" para comprar, alta chance de conversão se estimulado
  } else if (daysSinceLastOrder < avgInterval * 0.5) {
    probability = 0.1; // Comprou recentemente, chance baixa
  }

  return {
    nextOrderDays: Math.round(Math.max(0, avgInterval - daysSinceLastOrder)),
    probability,
    recommendedAction: probability > 0.7 ? "ALERTA: Cliente está no momento ideal de recompra!" : "Acompanhar comportamento."
  };
}
