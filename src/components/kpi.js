import {html} from "npm:htl";

/** Fila de tarjetas de indicadores: items = [{titulo, valor, nota}] */
export function kpis(items) {
  return html`<div class="kpis">${items.map(
    (k) => html`<div class="card kpi"><span class="kpi-titulo">${k.titulo}</span><span class="kpi-valor">${k.valor}</span><span class="kpi-nota">${k.nota ?? ""}</span></div>`
  )}</div>`;
}
