import * as Inputs from "npm:@observablehq/inputs";
import {html} from "npm:htl";

const CLAVE = "draftapp-analytics:filtros:v2";

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
    sessionStorage.setItem(CLAVE, JSON.stringify({desde: iso(v.desde, fechaMin), hasta: iso(v.hasta, fechaMax)}));
  } catch {}
}
function borrar() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {}
}

/**
 * Filtro global de rango de fechas (fecha del EVENTO). Valor: {desde, hasta}.
 * El estado se guarda en sessionStorage: se conserva al navegar entre páginas y al recargar
 * (se pierde al cerrar la pestaña). Si el storage no está disponible, funciona igual sin persistir.
 */
export function crearFiltros({fechaMin, fechaMax}) {
  const g = leer();
  const fecha = (s, def) => {
    const d = typeof s === "string" ? new Date(s) : null;
    return d && !isNaN(d) ? new Date(Math.min(Math.max(d, fechaMin), fechaMax)) : def;
  };
  const inputs = {
    desde: Inputs.date({label: "Desde", value: fecha(g.desde, fechaMin), min: fechaMin, max: fechaMax}),
    hasta: Inputs.date({label: "Hasta", value: fecha(g.hasta, fechaMax), min: fechaMin, max: fechaMax})
  };
  const limpiar = html`<button type="button" class="boton boton-sec">Limpiar filtros</button>`;
  const form = Inputs.form(inputs, {
    template: (i) => html`<div class="filtros">${Object.values(i)}${limpiar}</div>`
  });
  form.addEventListener("input", () => guardar(form.value, {fechaMin, fechaMax}));
  limpiar.onclick = () => {
    inputs.desde.value = fechaMin;
    inputs.hasta.value = fechaMax;
    inputs.desde.dispatchEvent(new Event("input", {bubbles: true})); // el form relee ambos inputs y guarda
    borrar(); // después del evento, para no dejar nada guardado
  };
  return form;
}
