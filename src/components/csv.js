import {html} from "npm:htl";
import {csvFormat} from "npm:d3-dsv";

/** Botón que descarga `filas` como CSV (con BOM para que Excel lea bien los acentos). */
export function botonCSV(filas, nombre = "datos.csv") {
  const boton = html`<button class="boton">Descargar CSV (${filas.length.toLocaleString("es-AR")} filas)</button>`;
  boton.onclick = () => {
    const datos = filas.map((f) => ({...f, fecha: f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : f.fecha}));
    const url = URL.createObjectURL(new Blob(["﻿" + csvFormat(datos)], {type: "text/csv;charset=utf-8"}));
    const a = html`<a href=${url} download=${nombre}></a>`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return boton;
}
