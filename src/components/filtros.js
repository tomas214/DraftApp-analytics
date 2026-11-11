import * as Inputs from "npm:@observablehq/inputs";
import {html} from "npm:htl";

const CLAVE = "draftapp-analytics:filtros:v1";

function leer() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE)) ?? {};
  } catch {
    return {};
  }
}
function guardar(v, {fechaMin, fechaMax}) {
  // Las fechas en su valor por defecto no se guardan: así, si el dato real crece, el rango se amplía solo.
  const iso = (d, def) => (d && d.getTime() !== def.getTime() ? d.toISOString().slice(0, 10) : undefined);
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({
      desde: iso(v.desde, fechaMin),
      hasta: iso(v.hasta, fechaMax),
      colores: v.colores,
      jugadores: v.jugadores
    }));
  } catch {}
}
function borrar() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {}
}

/**
 * Barra de filtros globales. Valor: {desde, hasta, jugadores, colores}.
 * El estado se guarda en sessionStorage: se conserva al navegar entre páginas y al recargar
 * (se pierde al cerrar la pestaña). Si el storage no está disponible, funciona igual sin persistir.
 */
export function crearFiltros({jugadores, colores, fechaMin, fechaMax}) {
  const g = leer();
  const fecha = (s, def) => {
    const d = typeof s === "string" ? new Date(s) : null;
    return d && !isNaN(d) ? new Date(Math.min(Math.max(d, fechaMin), fechaMax)) : def;
  };
  const subconjunto = (a, todos) => (Array.isArray(a) ? todos.filter((x) => a.includes(x)) : todos);

  const inputs = {
    desde: Inputs.date({label: "Desde", value: fecha(g.desde, fechaMin), min: fechaMin, max: fechaMax}),
    hasta: Inputs.date({label: "Hasta", value: fecha(g.hasta, fechaMax), min: fechaMin, max: fechaMax}),
    colores: Inputs.checkbox(colores, {label: "Color", value: subconjunto(g.colores, colores)}),
    jugadores: Inputs.select(jugadores, {label: "Jugadores", multiple: true, value: subconjunto(g.jugadores, jugadores), size: 6})
  };

  const limpiar = html`<button type="button" class="boton boton-sec">Limpiar filtros</button>`;
  const form = Inputs.form(inputs, {
    template: (i) => html`<div class="filtros">${Object.values(i)}${limpiar}</div>`
  });

  form.addEventListener("input", () => guardar(form.value, {fechaMin, fechaMax}));
  limpiar.onclick = () => {
    const defecto = {desde: fechaMin, hasta: fechaMax, colores, jugadores};
    for (const k in inputs) {
      inputs[k].value = defecto[k];
    }
    // Un solo evento: el form relee el valor de todos los inputs (y el listener guarda).
    inputs.desde.dispatchEvent(new Event("input", {bubbles: true}));
    borrar(); // después del evento, para no dejar nada guardado
  };
  return form;
}
