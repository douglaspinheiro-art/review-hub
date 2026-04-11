export type AnalyticsDailyRow = {
  date: string;
  messages_sent: number;
  messages_delivered: number;
  messages_read: number;
  new_contacts: number;
  revenue_influenced: number | string;
};

export type AnalyticsAggregate = {
  rows: AnalyticsDailyRow[];
  totals: {
    messagesSent: number;
    messagesDelivered: number;
    messagesRead: number;
    newContacts: number;
    revenue: number;
  };
  deliveryRate: number;
  readRate: number;
  chartData: {
    date: string;
    enviadas: number;
    entregues: number;
    lidas: number;
    novos_contatos: number;
    receita: number;
  }[];
};

export function aggregateAnalyticsDailyRows(rows: AnalyticsDailyRow[]): AnalyticsAggregate {
  const totals = rows.reduce(
    (acc, d) => ({
      messagesSent: acc.messagesSent + (d.messages_sent ?? 0),
      messagesDelivered: acc.messagesDelivered + (d.messages_delivered ?? 0),
      messagesRead: acc.messagesRead + (d.messages_read ?? 0),
      newContacts: acc.newContacts + (d.new_contacts ?? 0),
      revenue: acc.revenue + Number(d.revenue_influenced ?? 0),
    }),
    { messagesSent: 0, messagesDelivered: 0, messagesRead: 0, newContacts: 0, revenue: 0 },
  );

  const deliveryRate =
    totals.messagesSent > 0 ? Math.round((totals.messagesDelivered / totals.messagesSent) * 100) : 0;
  const readRate =
    totals.messagesDelivered > 0 ? Math.round((totals.messagesRead / totals.messagesDelivered) * 100) : 0;

  const chartData = rows.map((d) => ({
    date: new Date(d.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    enviadas: d.messages_sent ?? 0,
    entregues: d.messages_delivered ?? 0,
    lidas: d.messages_read ?? 0,
    novos_contatos: d.new_contacts ?? 0,
    receita: Number(d.revenue_influenced ?? 0),
  }));

  return { rows, totals, deliveryRate, readRate, chartData };
}
