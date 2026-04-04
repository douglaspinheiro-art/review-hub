// 📊 DADOS MOCK COMPLETOS (Prompt v3)

export const mockLoja = {
  nome: "Studio Moda Feminina", 
  plataforma: "Nuvemshop", 
  segmento: "Moda",
  conversion_health_score: 47, 
  chs_label: "Regular",
  chs_historico: [
    { data: "01/03", score: 42, label: "Em risco" },
    { data: "08/03", score: 44, label: "Em risco" },
    { data: "15/03", score: 43, label: "Em risco" },
    { data: "22/03", score: 47, label: "Regular" },
    { data: "29/03", score: 45, label: "Regular" },
    { data: "05/04", score: 47, label: "Regular" },
    { data: "12/04", score: 47, label: "Regular" },
  ],
  chs_breakdown: { conversao: 38, funil: 6, produtos: 13, mobile: 5 },
};

export const mockCanais = [
  { tipo: "loja_propria", nome: "Studio Moda — Nuvemshop", status: "ok",
    ultima_sync: "há 4 min", pedidos: 234, receita: 58500, cvr: 1.40,
    ticket_medio: 250, clientes_unicos: 89, chs: 47, reputacao: null },
  { tipo: "mercado_livre", nome: "Studio Moda Oficial", status: "ok",
    ultima_sync: "há 4 min", pedidos: 47, receita: 18800, cvr: 2.10,
    ticket_medio: 200, clientes_unicos: 19, sobreposicao: 12, chs: 61,
    reputacao: { nota: "amarelo", reclamacoes_abertas: 2, aviso: "Nota caiu de Verde" } },
];

export const mockMetricas = {
  visitantes: 12400, produto_visto: 8930, carrinho: 3472,
  checkout: 1736, pedido: 174, perda_mensal: 58400,
  meta_conversao: 2.5, ticket_medio: 250, benchmark_segmento: 2.8,
  visitantes_mobile: 7440, visitantes_desktop: 4960,
  pedidos_mobile: 61, pedidos_desktop: 113,
  cvr_mobile: 0.82, cvr_desktop: 2.27,
};

export const mockProdutos = [
  { nome: "Tênis Preto Casual", categoria: "Calçados", preco: 199,
    estoque: 0, estoque_critico: true, media_avaliacao: 3.8,
    num_visualizacoes: 1240, num_adicionados_carrinho: 234,
    num_vendas: 12, taxa_conversao_produto: 5.1, receita_30d: 2388,
    problema: "Estoque zerado nos tamanhos 38 e 40", impacto_estimado: 6800 },
  { nome: "Vestido Floral Midi", categoria: "Roupas", preco: 289,
    estoque: 47, estoque_critico: false, media_avaliacao: 4.7,
    num_visualizacoes: 2890, num_adicionados_carrinho: 892,
    num_vendas: 234, taxa_conversao_produto: 26.2, receita_30d: 67626,
    problema: null },
  { nome: "Blusa Linho Branca", categoria: "Roupas", preco: 159,
    estoque: 12, estoque_critico: false, media_avaliacao: 3.2,
    num_visualizacoes: 1890, num_adicionados_carrinho: 320,
    num_vendas: 28, taxa_conversao_produto: 8.8, receita_30d: 4452,
    problema: "Avaliação abaixo de 3.5", impacto_estimado: 4200 },
];

export const mockProblemas = [
  { tipo: "funil", titulo: "Taxa de checkout caiu 18% vs. ontem",
    severidade: "critico", status: "novo", impacto_estimado: 4200,
    detectado_em: "há 2 horas", canal: "Nuvemshop",
    causa_raiz: "Frete médio subiu R$12 (detectado via API)",
  },
  { tipo: "produto", titulo: "Tênis Preto Casual — CVR 5.1% vs benchmark 28%",
    severidade: "critico", status: "novo", impacto_estimado: 6800,
    detectado_em: "há 6 horas",
    causa_raiz: "Estoque zerado nos tamanhos 38 e 40",
  },
  { tipo: "funil", titulo: "847 clientes completam 60 dias sem comprar",
    severidade: "oportunidade", status: "novo", impacto_estimado: 12400,
    detectado_em: "hoje", canal: null,
  },
];

export const mockPrescricoes = [
  {
    id: "p1",
    titulo: 'Campanha "Frete grátis acima de R$199"',
    canal: "whatsapp", 
    segmento: "em_risco",
    num_clientes: 847,
    desconto_tipo: "frete_gratis", 
    desconto_valor: 0,
    desconto_justificativa: "Frete grátis tem percepção melhor que cupom para Em Risco",
    melhor_horario: "Terça às 10h",
    custo_estimado: 87, 
    potencial_estimado: 8400,
    roi_estimado: 96, 
    ab_teste_ativo: true,
    status: "aguardando_aprovacao",
    preview_msg: "Oi [Nome]! Frete grátis pra você hoje 🎁..."
  }
];

export const mockEventosSazonais = [
  { name: "Dia das Mães", dias_restantes: 18, tipo: "nacional",
    relevante_segmento: true, historico_crescimento: 67,
    prescricao_sugerida: "Campanha VIP pré-Dia das Mães" },
];

export const mockClienteDestaque = {
  nome: "Maria Santos", 
  email: "maria@email.com", 
  telefone: "+5511999998888",
  rfm_segmento: "campiao", 
  perfil_comportamental: "comprador_mobile",
  canal_preferido: "mercado_livre", 
  ltv_total: 1520,
  customer_health_score: 78, 
  churn_score: 0.05,
  ultima_compra: "3 dias atrás", 
  ultima_compra_canal: "mercado_livre",
  compras_por_canal: {
    loja_propria:  { pedidos: 3, receita: 450, ultima: "45 dias" },
    mercado_livre: { pedidos: 7, receita: 890, ultima: "3 dias" },
    shopee:        { pedidos: 2, receita: 180, ultima: "30 dias" },
  },
  whatsapp_opt_out: false, 
  email_opt_out: false,
  ultima_msg_whatsapp: "12 dias atrás", 
  msgs_sem_abertura: 0,
};

