import {html} from "npm:htl";

/** Aviso visible cuando los datos NO son reales (meta.fuente = "sintetico"). Con datos reales no muestra nada. */
export function avisoDatos(meta) {
  if (meta?.fuente !== "sintetico") return html`<span></span>`;
  return html`<div class="aviso-datos" role="alert"><strong>Datos de prueba.</strong> Estos datos son sintéticos y no corresponden a partidas reales.</div>`;
}
