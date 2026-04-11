/**
 * `attribution_events` no schema legado não tem `store_id`.
 * Quando há loja atual, restringe a eventos cuja campanha atribuída pertence a essa loja
 * (ou eventos sem campanha: automação pura / UTM — mantidos para não subcontar receita).
 */
export function scopeAttributionEventsForStore<
  T extends { attributed_campaign_id?: string | null },
>(events: T[], storeId: string | null, storeCampaignIds: readonly string[]): T[] {
  if (!storeId || storeCampaignIds.length === 0) return events;
  const set = new Set(storeCampaignIds);
  return events.filter((e) => {
    const cid = e.attributed_campaign_id;
    if (cid == null || cid === "") return true;
    return set.has(cid);
  });
}
