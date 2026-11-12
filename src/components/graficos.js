// Constructores de gráficos (Observable Plot). Reciben datos ya agregados por datos.js.
import * as Plot from "npm:@observablehq/plot";
import {html} from "npm:htl";
import {ACENTO, ACENTO2, COLOR_DRAFT, PALETA_JUGADORES, pct, num, fechaCorta} from "./tema.js";

// Gráfico "Jugando primero / Robando primero": un jugador entra en una categoría solo si tiene al menos esta cantidad de
// partidas en ella, para que su winrate no dependa de una sola partida.
export const MIN_PARTIDAS = 3;

const DIA = 86400000;

// Alto y márgenes COMUNES de los dos gráficos de la segunda fila (densidad y jugando primero / robando primero): así sus ejes
// x quedan a la misma altura. (Antes cada uno usaba el alto y los márgenes por defecto de Plot, y el segundo además tenía
// encima una leyenda con altura variable.)
const ALTO_FILA = 380;
const MARGENES_FILA = {marginTop: 28, marginRight: 24, marginBottom: 40, marginLeft: 56};

// Rótulos del gráfico: "jugando primero" = el jugador que empezó la partida; "robando primero" = el que no empezó.
export const JUGANDO_PRIMERO = "Jugando primero";
export const ROBANDO_PRIMERO = "Robando primero";

// Título del eje x de los gráficos de barras: abajo del todo y alineado a la derecha del eje.
const EJE_X_DERECHA = {labelAnchor: "right", labelOffset: 52};
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000; // 0..1, determinístico (el jitter no cambia al re-renderizar)
};

/** 1. Densidad (KDE) de la duración de las partidas. */
export function graficoDensidad(puntos, width) {
  return Plot.plot({
    width, height: ALTO_FILA, ...MARGENES_FILA,
    x: {label: "Duración (min)"},
    y: {label: "Densidad", grid: true, tickFormat: ".3f"},
    marks: [
      Plot.areaY(puntos, {x: "x", y: "y", fill: ACENTO, fillOpacity: 0.3}),
      Plot.lineY(puntos, {x: "x", y: "y", stroke: ACENTO, strokeWidth: 2}),
      Plot.ruleY([0]),
      Plot.tip(puntos, Plot.pointerX({x: "x", y: "y", title: (d) => `${num(d.x, 1)} min\nDensidad: ${d.y.toFixed(4)}`}))
    ]
  });
}

// Framework limita los svg a max-width:100%; para el gráfico ancho (con scroll horizontal) hay que quitarlo.
const sinTope = (fig) => {
  fig.querySelectorAll?.("svg").forEach((s) => (s.style.maxWidth = "none"));
  if (fig.tagName === "svg") fig.style.maxWidth = "none";
  return fig;
};

/** 2. Barras por combinación de colores. modo: "winrate" | "ocurrencias". */
export function graficoCombinaciones(filas, modo, width) {
  if (modo === "ocurrencias") {
    const orden = [...filas].sort((a, b) => b.mazos - a.mazos || a.combo.localeCompare(b.combo));
    const w = Math.max(width, orden.length * 28);
    return sinTope(Plot.plot({
      width: w, height: 400, marginBottom: 78,
      x: {label: "Combinación de colores", domain: orden.map((d) => d.combo), tickRotate: -60, ...EJE_X_DERECHA, labelOffset: 66},
      y: {label: "Mazos", grid: true},
      marks: [
        Plot.barY(orden, {x: "combo", y: "mazos", fill: ACENTO, tip: true, title: (d) => `${d.combo}\nMazos: ${d.mazos}`}),
        Plot.ruleY([0])
      ]
    }));
  }
  // En modo winrate solo se muestran combinaciones con algún resultado (un mazo sin partidas oficiales no tiene barras)
  const orden = filas.filter((d) => d.wr_enf != null || d.wr_part != null).sort((a, b) => (b.wr_enf ?? -1) - (a.wr_enf ?? -1) || a.combo.localeCompare(b.combo));
  const largo = orden.flatMap((d) => [
    {combo: d.combo, metrica: "Enfrentamientos", valor: d.wr_enf, jugadas: d.enf_jugadas, ganadas: d.enf_ganadas},
    {combo: d.combo, metrica: "Partidas", valor: d.wr_part, jugadas: d.part_jugadas, ganadas: d.part_ganadas}
  ]).filter((d) => d.valor != null);
  const w = Math.max(width, orden.length * 46);
  return sinTope(Plot.plot({
    width: w, height: 420, marginBottom: 78,
    fx: {label: "Combinación de colores", domain: orden.map((d) => d.combo), padding: 0.12, tickRotate: -60, ...EJE_X_DERECHA, labelOffset: 66},
    x: {axis: null, domain: ["Enfrentamientos", "Partidas"]},
    y: {label: "Winrate", grid: true, domain: [0, 1], tickFormat: "%"},
    color: {domain: ["Enfrentamientos", "Partidas"], range: [ACENTO, ACENTO2], legend: true},
    marks: [
      Plot.barY(largo, {fx: "combo", x: "metrica", y: "valor", fill: "metrica", tip: true,
        title: (d) => `${d.combo} · ${d.metrica}\nWinrate: ${pct(d.valor)} (${d.ganadas}/${d.jugadas})`}),
      Plot.ruleY([0.5], {stroke: "currentColor", strokeOpacity: 0.35, strokeDasharray: "4,3"})
    ]
  }));
}

const METRICAS_SERIE = {
  inscriptos: {y: "inscriptos", etiqueta: "Inscriptos", cero: true},
  draft: {y: "duracion_draft", etiqueta: "Duración del draft (min)"}
};

/** 3. Serie temporal por evento. metrica: inscriptos | draft ("Duración de partida" usa graficoSerieBoxplot). */
export function graficoSerie(filas, metrica, width) {
  const m = METRICAS_SERIE[metrica];
  const datos = filas.filter((d) => d[m.y] != null);
  const fechas = datos.map((d) => +d.fecha);
  const dominio = fechas.length ? [new Date(Math.min(...fechas) - 7 * DIA), new Date(Math.max(...fechas) + 7 * DIA)] : undefined;
  return Plot.plot({
    width, height: 380,
    x: {
      type: "utc", label: "Fecha", domain: dominio, ticks: "month", grid: true,
      tickFormat: (d) => d.toLocaleDateString("es-AR", {month: "short", year: "2-digit", timeZone: "UTC"})
    },
    y: {label: m.etiqueta, grid: true, nice: true, zero: !!m.cero},
    marks: [
      // Los días con draft se marcan con otro color
      Plot.ruleX(datos, {x: "fecha", stroke: COLOR_DRAFT, strokeOpacity: 0.3}),
      m.desvio && Plot.ruleX(datos, {x: "fecha", y1: (d) => d[m.y] - d[m.desvio], y2: (d) => d[m.y] + d[m.desvio], stroke: COLOR_DRAFT, strokeWidth: 1.5}),
      Plot.lineY(datos, {x: "fecha", y: m.y, stroke: ACENTO, strokeWidth: 2, curve: "monotone-x"}),
      Plot.dot(datos, {
        x: "fecha", y: m.y, fill: COLOR_DRAFT, stroke: "white", strokeWidth: 1, r: 5, tip: true,
        title: (d) => `${d.evento} · ${fechaCorta(d.fecha)}\n${m.etiqueta}: ${num(d[m.y], 1)}` + (m.desvio ? `\nDesvío estándar: ${num(d[m.desvio], 1)}` : "")
      })
    ]
  });
}

// Boxplots: estilo y marcas COMPARTIDOS por todos los boxplots del sitio (duración de partida por día de draft y por cubo).
const ALTO_BOXPLOT = 380;
const CAJA = {color: COLOR_DRAFT, relleno: 0.35, grosor: 1.5, grosorMediana: 2.5, radioAtipico: 2.5};
const textoCaja = (d, titulo) =>
  `${titulo}
Mediana: ${num(d.mediana, 1)}
Q1 – Q3: ${num(d.q1, 1)} – ${num(d.q3, 1)}
Bigotes: ${num(d.bigoteMin, 1)} – ${num(d.bigoteMax, 1)}
Partidas: ${d.n}`;

/**
 * Marcas de un boxplot: bigotes con tapas, caja entre cuartiles, mediana y atípicos como puntos.
 * La posición en x la dan las funciones: x (centro), desde/hasta (extremos de la caja) y capDesde/capHasta (extremos de las tapas).
 */
function marcasBoxplot(cajas, atipicos, {x, desde, hasta, capDesde, capHasta, titulo}) {
  return [
    Plot.ruleX(cajas, {x, y1: "bigoteMin", y2: "q1", stroke: CAJA.color, strokeWidth: CAJA.grosor}),
    Plot.ruleX(cajas, {x, y1: "q3", y2: "bigoteMax", stroke: CAJA.color, strokeWidth: CAJA.grosor}),
    Plot.ruleY(cajas, {x1: capDesde, x2: capHasta, y: "bigoteMin", stroke: CAJA.color, strokeWidth: CAJA.grosor}),
    Plot.ruleY(cajas, {x1: capDesde, x2: capHasta, y: "bigoteMax", stroke: CAJA.color, strokeWidth: CAJA.grosor}),
    Plot.rect(cajas, {
      x1: desde, x2: hasta, y1: "q1", y2: "q3", fill: CAJA.color, fillOpacity: CAJA.relleno, stroke: CAJA.color, strokeWidth: CAJA.grosor, tip: true,
      title: (d) => textoCaja(d, titulo(d))
    }),
    Plot.ruleY(cajas, {x1: desde, x2: hasta, y: "mediana", stroke: "currentColor", strokeWidth: CAJA.grosorMediana}),
    Plot.dot(atipicos, {
      x, y: "valor", r: CAJA.radioAtipico, fill: "none", stroke: CAJA.color, strokeWidth: 1.2, tip: true,
      title: (d) => `${titulo(d)}
Atípico: ${num(d.valor, 0)} min`
    })
  ];
}

/** 3 (opción "Duración de partida"). Un boxplot por día de draft; cajas de datos.js (boxplotsPorEvento). */
export function graficoSerieBoxplot({cajas, atipicos}, width) {
  const mitad = 1.6 * DIA; // medio ancho de la caja, en días
  const fechas = cajas.map((d) => +d.fecha);
  const dominio = fechas.length ? [new Date(Math.min(...fechas) - 7 * DIA), new Date(Math.max(...fechas) + 7 * DIA)] : undefined;
  return Plot.plot({
    width, height: ALTO_BOXPLOT,
    x: {
      type: "utc", label: "Fecha", domain: dominio, ticks: "month", grid: true,
      tickFormat: (d) => d.toLocaleDateString("es-AR", {month: "short", year: "2-digit", timeZone: "UTC"})
    },
    y: {label: "Duración de partida (min)", grid: true, nice: true},
    marks: [
      Plot.ruleX(cajas, {x: "fecha", stroke: COLOR_DRAFT, strokeOpacity: 0.3}), // día con draft
      ...marcasBoxplot(cajas, atipicos, {
        x: "fecha",
        desde: (d) => new Date(+d.fecha - mitad), hasta: (d) => new Date(+d.fecha + mitad),
        capDesde: (d) => new Date(+d.fecha - mitad / 2), capHasta: (d) => new Date(+d.fecha + mitad / 2),
        titulo: (d) => `${d.evento} · ${fechaCorta(d.fecha)}`
      })
    ]
  });
}

/**
 * 6b. Un boxplot por cubo con la duración de las partidas (cajas de datos.js: boxplotsPorCubo). Mismo estilo y marcas que el boxplot
 * por día de draft; el eje x es numérico (posición de cada cubo) con el nombre del cubo como marca, y sin título.
 */
export function graficoCuboBoxplot({cajas, atipicos}, width) {
  const n = cajas.length;
  const mitad = 0.3; // medio ancho de la caja, en posiciones de cubo
  return Plot.plot({
    width, height: ALTO_BOXPLOT,
    x: {label: null, domain: [-0.6, n - 0.4], ticks: cajas.map((d) => d.indice), tickFormat: (i) => cajas[i]?.cubo ?? ""},
    y: {label: "Duración de las partidas (min)", grid: true, nice: true},
    marks: marcasBoxplot(cajas, atipicos, {
      x: "indice",
      desde: (d) => d.indice - mitad, hasta: (d) => d.indice + mitad,
      capDesde: (d) => d.indice - mitad / 2, capHasta: (d) => d.indice + mitad / 2,
      titulo: (d) => d.cubo
    })
  });
}

// Referencia de la media y la mediana (mismos símbolos que el gráfico; ver .leyenda en style.css)
const leyendaEmpezo = () =>
  html`<div class="leyenda"><span><i class="simbolo media"></i>Media</span><span><i class="simbolo mediana"></i>Mediana</span></div>`;

/**
 * 4. Jugando primero / Robando primero. puntos: [{jugador, categoria, winrate, n}]; resumenes: [{categoria, media, mediana}].
 * Con `pintar` cada jugador lleva su color y se conectan sus dos valores (solo si tiene punto en ambas categorías).
 */
export function graficoEmpezo(puntos, resumenes, pintar, jugadores, width) {
  const idx = {[JUGANDO_PRIMERO]: 0, [ROBANDO_PRIMERO]: 1};
  const dispersos = puntos
    .map((d) => ({...d, x: idx[d.categoria] + (hash(d.jugador + d.categoria) - 0.5) * 0.5}))
    .sort((a, b) => idx[a.categoria] - idx[b.categoria]);
  const medias = resumenes.map((r) => ({...r, x: idx[r.categoria] - 0.1}));
  const medianas = resumenes.map((r) => ({...r, x: idx[r.categoria] + 0.1}));
  const cuenta = new Map();
  for (const d of dispersos) cuenta.set(d.jugador, (cuenta.get(d.jugador) ?? 0) + 1);
  const conectados = dispersos.filter((d) => cuenta.get(d.jugador) === 2);
  const plot = Plot.plot({
    width, height: ALTO_FILA, ...MARGENES_FILA,
    x: {label: null, domain: [-0.6, 1.6], ticks: [0, 1], tickFormat: (d) => (d === 0 ? JUGANDO_PRIMERO : ROBANDO_PRIMERO)},
    y: {label: "Winrate de partidas", grid: true, domain: [0, 1], tickFormat: "%"},
    // Un color por jugador SIN leyenda: la escala existe siempre (aunque no se pinte) para que el gráfico no cambie de tamaño.
    color: {domain: jugadores, range: PALETA_JUGADORES},
    marks: [
      Plot.ruleY([0.5], {stroke: "currentColor", strokeOpacity: 0.3, strokeDasharray: "4,3"}),
      pintar ? Plot.line(conectados, {x: "x", y: "winrate", z: "jugador", stroke: "jugador", strokeWidth: 1.5, strokeOpacity: 0.6}) : null,
      Plot.dot(dispersos, {
        x: "x", y: "winrate", r: 6, fill: pintar ? "jugador" : ACENTO, fillOpacity: 0.35, stroke: pintar ? "jugador" : ACENTO, strokeOpacity: 0.5, tip: true,
        title: (d) => `${d.jugador}\n${d.categoria}: ${pct(d.winrate)} en ${d.n} partidas`
      }),
      Plot.dot(medias, {x: "x", y: "media", r: 8, fill: "#ffffff", stroke: "#222", strokeWidth: 1.5, tip: true,
        title: (d) => `Media · ${d.categoria}\n${pct(d.media)} (${d.n} jugadores)`}),
      Plot.dot(medianas, {x: "x", y: "mediana", r: 8, symbol: "diamond", fill: "#fff3b0", stroke: "#222", strokeWidth: 1.5, tip: true,
        title: (d) => `Mediana · ${d.categoria}\n${pct(d.mediana)} (${d.n} jugadores)`})
    ]
  });
  return html`<div class="grafico-empezo">${leyendaEmpezo()}${plot}</div>`;
}

/** 5. Valoración propia del mazo vs. winrate de partidas, con recta de mínimos cuadrados. */
export function graficoValoracion(filas, width) {
  return Plot.plot({
    width, height: 520,
    x: {label: "Valoración propia del mazo", domain: [0.5, 10.5], ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], grid: true},
    y: {label: "Winrate de partidas", grid: true, domain: [0, 1], tickFormat: "%"},
    marks: [
      Plot.dot(filas, {
        x: (d) => d.autoevaluacion + (hash(d.jugador + d.evento) - 0.5) * 0.35, y: "winrate", r: 4.5, fill: ACENTO, fillOpacity: 0.45, tip: true,
        title: (d) => `${d.jugador} · ${d.evento}\nValoración: ${d.autoevaluacion}\nWinrate: ${pct(d.winrate)} (${d.n} partidas)`
      }),
      Plot.linearRegressionY(filas, {x: "autoevaluacion", y: "winrate", stroke: ACENTO2, strokeWidth: 2.5, ci: 0})
    ]
  });
}

/** 6. Barras por cubo con promedio y desvío estándar (barra de error). */
export function graficoCubo(filas, etiquetaY, width) {
  return Plot.plot({
    width, height: ALTO_BOXPLOT, // sin título de eje; mismo alto que el boxplot de al lado
    x: {label: null, domain: filas.map((d) => d.cubo)},
    y: {label: etiquetaY, grid: true, zero: true},
    marks: [
      Plot.barY(filas, {x: "cubo", y: "media", fill: ACENTO, fillOpacity: 0.85, tip: true,
        title: (d) => `${d.cubo}\nPromedio: ${num(d.media, 1)} min\nDesvío estándar: ${num(d.desvio, 1)}\nn = ${d.n}`}),
      Plot.ruleX(filas, {x: "cubo", y1: (d) => d.media - d.desvio, y2: (d) => d.media + d.desvio, stroke: "currentColor", strokeWidth: 1.5}),
      Plot.ruleY([0])
    ]
  });
}
