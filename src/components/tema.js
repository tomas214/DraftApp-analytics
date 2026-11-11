// Paleta y formatos compartidos para que los colores sean consistentes en todos los visuales.
export const ACENTO = "#4269d0";

export const COLORES = {
  W: {nombre: "Blanco", hex: "#d9c98a"},
  U: {nombre: "Azul", hex: "#4e8fd6"},
  B: {nombre: "Negro", hex: "#7a6f8f"},
  R: {nombre: "Rojo", hex: "#e0584b"},
  G: {nombre: "Verde", hex: "#4fa56b"}
};
export const nombreColor = (c) => COLORES[c]?.nombre ?? c;
export const escalaColores = {
  domain: Object.values(COLORES).map((c) => c.nombre),
  range: Object.values(COLORES).map((c) => c.hex)
};

export const pct = (x) =>
  Number.isFinite(x) ? new Intl.NumberFormat("es-AR", {style: "percent", maximumFractionDigits: 1}).format(x) : "—";
export const num = (x, d = 0) =>
  Number.isFinite(x) ? new Intl.NumberFormat("es-AR", {maximumFractionDigits: d}).format(x) : "—";
export const fechaCorta = (d) =>
  d.toLocaleDateString("es-AR", {day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"});
