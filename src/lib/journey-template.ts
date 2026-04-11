/**
 * Normaliza placeholders da UI para o formato esperado pelo `flow-engine`
 * (substitui {{nome}} e {{link}} no runtime).
 */
export function normalizeTemplateForFlowEngine(template: string): string {
  return template
    .replaceAll("{{name}}", "{{nome}}")
    .replaceAll("{{magic_link}}", "{{link}}");
}

export function slugifyJourneyTipo(raw: string): string {
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return s || "jornada";
}
