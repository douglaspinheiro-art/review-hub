/**
 * Newsletter Renderer (dashboard)
 * Shared HTML lives in supabase/functions/_shared/newsletter-html.ts (Vite alias @newsletter-html).
 */

import {
  type BlockType,
  type ColumnSlot,
  type Block,
  type RenderOpts,
  interpolateMerge,
  parseRichText,
  renderBlocksToHTML as renderBlocksToHTMLCore,
  appendUtmParams,
} from "@newsletter-html";

export type { BlockType, ColumnSlot, Block, RenderOpts };
export { interpolateMerge, parseRichText, appendUtmParams };

/** Variables shown in the editor preview (fictitious data). */
export const PREVIEW_MERGE_VARS: Record<string, string> = {
  nome: "João Silva",
  loja: "Minha Loja",
  email: "joao@exemplo.com",
};

export function renderBlocksToHTML(blocks: Block[], opts: RenderOpts = {}): string {
  return renderBlocksToHTMLCore(blocks, {
    ...opts,
    mergeVars: { ...PREVIEW_MERGE_VARS, ...opts.mergeVars },
  });
}

export function createDefaultBlocks(storeName = "Minha Loja"): Block[] {
  return [
    {
      id: crypto.randomUUID(),
      type: "header",
      data: { title: `Novidades da ${storeName}`, subtitle: "Confira o que preparamos para você" },
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      data: { content: "Olá, {{nome}}! Estamos com novidades incríveis esta semana. Escreva aqui o conteúdo da sua newsletter." },
    },
    {
      id: crypto.randomUUID(),
      type: "button",
      data: { label: "Ver ofertas", url: "https://", color: "primary" },
    },
  ];
}

export type NewsletterTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  blocks: () => Block[];
};

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    id: "blank",
    name: "Em branco",
    description: "Comece do zero",
    emoji: "✏️",
    blocks: createDefaultBlocks,
  },
  {
    id: "promo",
    name: "Promoção",
    description: "Oferta com desconto e CTA",
    emoji: "🏷️",
    blocks: () => [
      { id: crypto.randomUUID(), type: "header", data: { title: "Oferta especial para você, {{nome}}!", subtitle: "Só até domingo • Aproveite", bgColor: "#dc2626" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Preparamos uma seleção exclusiva com até **50% de desconto** nos produtos mais amados da {{loja}}.\n\nNão perca essa chance — a oferta é por tempo limitado!" } },
      { id: crypto.randomUUID(), type: "product", data: { imageUrl: "", name: "Produto em destaque", price: "R$ 79,90", oldPrice: "R$ 159,90", buttonLabel: "Comprar agora", buttonUrl: "https://" } },
      { id: crypto.randomUUID(), type: "button", data: { label: "Ver todos os produtos", url: "https://", color: "dark" } },
    ],
  },
  {
    id: "lancamento",
    name: "Lançamento",
    description: "Apresentação de novo produto",
    emoji: "🚀",
    blocks: () => [
      { id: crypto.randomUUID(), type: "header", data: { title: "Novidade chegou!", subtitle: "Você é um dos primeiros a saber", bgColor: "#0f766e" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Olá, {{nome}}!\n\nTemos o prazer de apresentar nossa mais nova coleção. Desenvolvida com muito cuidado especialmente para você." } },
      { id: crypto.randomUUID(), type: "image", data: { url: "", alt: "Novo produto", href: "https://" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "**Por que você vai amar:**\n- Qualidade premium\n- Design exclusivo\n- Entrega rápida" } },
      { id: crypto.randomUUID(), type: "button", data: { label: "Conhecer o lançamento", url: "https://", color: "primary" } },
    ],
  },
  {
    id: "reativacao",
    name: "Reativação",
    description: "Recuperar clientes inativos",
    emoji: "💌",
    blocks: () => [
      { id: crypto.randomUUID(), type: "header", data: { title: "Sentimos sua falta, {{nome}}!", subtitle: "Preparamos algo especial para você voltar", bgColor: "#b45309" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Faz um tempo que não nos vemos por aqui...\n\nPor isso, preparamos um cupom exclusivo para você: use **VOLTEI15** e ganhe 15% de desconto em qualquer produto da {{loja}}." } },
      { id: crypto.randomUUID(), type: "divider", data: {} as Record<string, never> },
      { id: crypto.randomUUID(), type: "text", data: { content: "O cupom é válido por **7 dias**. Não deixe passar!" } },
      { id: crypto.randomUUID(), type: "button", data: { label: "Usar meu cupom agora", url: "https://", color: "primary" } },
    ],
  },
  {
    id: "semanal",
    name: "Newsletter Semanal",
    description: "Conteúdo e novidades semanais",
    emoji: "📰",
    blocks: () => [
      { id: crypto.randomUUID(), type: "header", data: { title: "Novidades da semana", subtitle: "O melhor da {{loja}} em um e-mail" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Olá, {{nome}}! Aqui está o resumo da semana:" } },
      { id: crypto.randomUUID(), type: "columns", data: { left: { title: "Produto da semana", text: "Descrição breve do produto.", buttonLabel: "Ver mais", buttonUrl: "https://" }, right: { title: "Dica da semana", text: "Uma dica útil para seus clientes.", buttonLabel: "Saiba mais", buttonUrl: "https://" } } },
      { id: crypto.randomUUID(), type: "divider", data: {} as Record<string, never> },
      { id: crypto.randomUUID(), type: "button", data: { label: "Visitar a loja", url: "https://", color: "dark" } },
    ],
  },
  {
    id: "aniversario",
    name: "Aniversário",
    description: "Parabenize clientes no aniversário",
    emoji: "🎂",
    blocks: () => [
      { id: crypto.randomUUID(), type: "header", data: { title: "Feliz Aniversário, {{nome}}! 🎉", subtitle: "A {{loja}} tem um presente especial para você", bgColor: "#be123c" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Neste dia especial, queremos celebrar com você!\n\nUse o cupom **ANIVER20** e ganhe **20% de desconto** em qualquer compra. Válido por 30 dias a partir de hoje." } },
      { id: crypto.randomUUID(), type: "button", data: { label: "Resgatar meu presente", url: "https://", color: "primary" } },
      { id: crypto.randomUUID(), type: "text", data: { content: "Com carinho,\n_Equipe {{loja}}_" } },
    ],
  },
];
