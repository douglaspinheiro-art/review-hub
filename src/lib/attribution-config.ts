/** Janela last-touch usada pelo pipeline (edge `conversion-attribution`) e refletida na UI. */
export const ATTRIBUTION_WINDOW_HOURS = 72;

export const ATTRIBUTION_WINDOW_LABEL = "72h";

/** Dias de calendário equivalentes à janela (arredondado para cima); alinhar defaults em SQL com isto. */
export const ATTRIBUTION_WINDOW_DAYS = Math.ceil(ATTRIBUTION_WINDOW_HOURS / 24);
