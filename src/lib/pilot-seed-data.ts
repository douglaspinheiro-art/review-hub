/**
 * Seed data for pilot stores — gives immediate value on first login.
 * Called after onboarding completes for pilot users.
 */
import { supabase } from "@/lib/supabase";

const DEMO_CONTACTS = [
  { name: "Maria Silva", phone: "5511999001001", email: "maria@demo.com", tags: ["vip", "piloto"], total_orders: 8, total_spent: 2340, rfm_segment: "Campeões" },
  { name: "João Santos", phone: "5511999002002", email: "joao@demo.com", tags: ["recorrente", "piloto"], total_orders: 3, total_spent: 890, rfm_segment: "Fiéis" },
  { name: "Ana Costa", phone: "5511999003003", email: "ana@demo.com", tags: ["novo", "piloto"], total_orders: 1, total_spent: 320, rfm_segment: "Novos" },
  { name: "Pedro Oliveira", phone: "5511999004004", email: "pedro@demo.com", tags: ["em_risco", "piloto"], total_orders: 2, total_spent: 560, rfm_segment: "Em Risco" },
  { name: "Carla Mendes", phone: "5511999005005", email: "carla@demo.com", tags: ["dormentes", "piloto"], total_orders: 1, total_spent: 180, rfm_segment: "Dormentes" },
];

export async function seedPilotStore(userId: string, storeId: string): Promise<void> {
  try {
    // 1. Insert demo contacts
    const contactRows = DEMO_CONTACTS.map((c) => ({
      user_id: userId,
      store_id: storeId,
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: c.tags,
      total_orders: c.total_orders,
      total_spent: c.total_spent,
      status: "active",
    }));

    await supabase.from("contacts").insert(contactRows as never[]);

    // 2. Insert demo customers_v3 with RFM
    const customerRows = DEMO_CONTACTS.map((c) => ({
      user_id: userId,
      store_id: storeId,
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: c.tags,
      rfm_segment: c.rfm_segment,
      rfm_recency: c.rfm_segment === "Campeões" ? 5 : c.rfm_segment === "Dormentes" ? 90 : 30,
      rfm_frequency: c.total_orders,
      rfm_monetary: c.total_spent,
      customer_health_score: c.rfm_segment === "Campeões" ? 92 : c.rfm_segment === "Em Risco" ? 35 : 60,
    }));

    await supabase.from("customers_v3").insert(customerRows as never[]);

    // 3. Insert mock funnel metrics
    await supabase.from("funnel_metrics").insert({
      user_id: userId,
      store_id: storeId,
      visitantes: 12400,
      visualizacoes_produto: 8930,
      adicionou_carrinho: 3472,
      iniciou_checkout: 1736,
      compras: 174,
      receita: 43500,
    } as never);

    console.info("[pilot-seed] Seed data inserted for store", storeId);
  } catch (err) {
    console.warn("[pilot-seed] Non-critical seed error:", err);
  }
}
