import {html} from "npm:htl";
import {csvFormat} from "npm:d3-dsv";

/** Texto CSV de `filas`; `columnas` = {campo: "Encabezado"} define orden y nombres. */
export function aCSV(filas, columnas) {
  const campos = Object.keys(columnas);
  const datos = filas.map((f) =>
    Object.fromEntries(campos.map((c) => [columnas[c], f[c] instanceof Date ? f[c].toISOString().slice(0, 10) : f[c]]))
  );
  return csvFormat(datos, campos.map((c) => columnas[c]));
}

/** Interruptor ÚNICO de la descarga de CSV: con `false` el botón se ve y se comporta como deshabilitado. Para habilitarla, cambiar solo esta línea. */
export const CSV_HABILITADO = false;

/** Botón que descarga `filas` como CSV (UTF-8 con BOM para que Excel lea bien las tildes). Deshabilitado si CSV_HABILITADO es false. */
export function botonCSV(filas, columnas, nombre = "datos.csv") {
  const boton = html`<button type="button" class="boton" disabled=${!CSV_HABILITADO}>Descargar CSV (${filas.length.toLocaleString("es-AR")} filas)</button>`;
  boton.onclick = () => {
    const url = URL.createObjectURL(new Blob(["﻿", aCSV(filas, columnas)], {type: "text/csv;charset=utf-8"}));
    const a = html`<a href=${url} download=${nombre} hidden></a>`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return boton;
}
