import * as Inputs from "npm:@observablehq/inputs";
import {html} from "npm:htl";

/** Barra de filtros globales. Devuelve un form cuyo valor es {desde, hasta, jugadores, colores}. */
export function crearFiltros({jugadores, colores, fechaMin, fechaMax}) {
  return Inputs.form(
    {
      desde: Inputs.date({label: "Desde", value: fechaMin, min: fechaMin, max: fechaMax}),
      hasta: Inputs.date({label: "Hasta", value: fechaMax, min: fechaMin, max: fechaMax}),
      colores: Inputs.checkbox(colores, {label: "Color", value: colores}),
      jugadores: Inputs.select(jugadores, {label: "Jugadores", multiple: true, value: jugadores, size: 6})
    },
    {template: (i) => html`<div class="filtros">${Object.values(i)}</div>`}
  );
}
