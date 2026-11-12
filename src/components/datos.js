// Transformaciones y reglas de negocio. Las páginas solo dependen del esquema documentado en
// src/data/sintetico.js (el mismo que publica la base real), no del origen del dato.
//
// REGLAS VIGENTES (la base ya publica solo lo oficial: sin walkovers, sin venganzas y sin Gigante de dos cabezas; aquí se
// mantienen igualmente como defensa):
//   Eventos:        es_oficial = true y event_type distinto de two_headed_giant (2HG se excluye de TODO).
//   Participantes:  solo rol "player" cuenta como mazo/inscripto (ghost y exile no).
//   Enfrentamiento: resultado "victoria" (empates y pendientes no cuentan) y fase distinta de "venganza". Cualquier formato
//                   (BO1/BO2/BO3), competición y fase, incluidos desempates y final.
//   Partida:        estado "completed", con ganador y tipo draft | tiebreak | final (las venganzas no cuentan).
//   Mazo prestado:  las partidas/cruces con mazo prestado y las del exilio quedan FUERA de las estadísticas de color (y de la
//                   valoración del mazo), pero cuentan para duración y para "quién empieza".
//   Walkovers:      no llegan (la base no los publica); no hay nada que filtrar.
//   Jugadores:      "Jugador n" con n = puesto de ESTA publicación; nada aquí asume que un número es estable entre refrescos.
//   Fecha:          toda partida toma la fecha de SU EVENTO (día del draft), aunque se haya jugado
//                   después (la base no publica fecha de juego). Esa fecha es la que usan el filtro y la serie.
//   Dispersión:     desvíos estándar poblacionales (se trabaja con la población completa, sin muestreo).
import {rollup, group, sum, mean, median, quantile} from "npm:d3-array";

const TIPOS_OFICIALES = new Set(["draft", "tiebreak", "final"]);

export function prepararDatos(raw) {
  const jug = new Map(raw.jugadores.map((j) => [j.id, j.nombre]));
  const cub = new Map(raw.cubos.map((c) => [c.id, c.nombre]));
  const evs = raw.eventos
    .filter((e) => e.es_oficial && e.event_type !== "two_headed_giant")
    .map((e) => ({...e, fecha: new Date(e.fecha), cubo: cub.get(e.cubo_id)}));
  const ev = new Map(evs.map((e) => [e.id, e]));

  const jugadoresPorEvento = new Map();
  const mazo = new Map(); // `${evento}:${jugador}` -> participación
  const mazos = [];
  for (const p of raw.participaciones) {
    const e = ev.get(p.evento_id);
    if (!e || p.rol !== "player") continue;
    const fila = {
      evento_id: e.id, evento: e.nombre, fecha: e.fecha, jugador: jug.get(p.jugador_id),
      combo: p.colores, autoevaluacion: p.autoevaluacion
    };
    mazo.set(`${p.evento_id}:${p.jugador_id}`, fila);
    mazos.push(fila);
    jugadoresPorEvento.set(e.id, (jugadoresPorEvento.get(e.id) ?? 0) + 1);
  }
  for (const e of evs) e.inscriptos = jugadoresPorEvento.get(e.id) ?? 0;

  const enf = new Map(raw.enfrentamientos.map((x) => [x.id, x]));

  // Enfrentamientos oficiales: una fila por jugador (perspectiva del jugador)
  const filasEnf = [];
  for (const x of raw.enfrentamientos) {
    const e = ev.get(x.evento_id);
    if (!e || x.resultado !== "victoria" || x.ganador_id == null || x.fase === "venganza" || x.con_mazo_prestado) continue;
    for (const id of [x.jugador_a, x.jugador_b]) {
      const m = mazo.get(`${x.evento_id}:${id}`);
      if (!m) continue;
      filasEnf.push({evento_id: e.id, fecha: e.fecha, jugador: m.jugador, combo: m.combo, gano: x.ganador_id === id ? 1 : 0});
    }
  }

  // Partidas oficiales: una fila por partida (tabla de detalle) y una por jugador (estadísticas)
  const partidas = [];
  const filasPartida = [];
  for (const p of raw.partidas) {
    const x = enf.get(p.enfrentamiento_id);
    const e = x && ev.get(x.evento_id);
    if (!e || p.estado !== "completed" || p.ganador_id == null || !TIPOS_OFICIALES.has(p.tipo)) continue;
    // ma / mb: mazo del jugador en el evento; undefined para el exilio (juega sin mazo propio declarado)
    const ma = mazo.get(`${e.id}:${p.jugador_a}`);
    const mb = mazo.get(`${e.id}:${p.jugador_b}`);
    partidas.push({
      partida_id: p.id, evento_id: e.id, evento: e.nombre, fecha: e.fecha, cubo: e.cubo,
      fase: x.fase, tipo: p.tipo, numero: p.numero,
      jugador_a: jug.get(p.jugador_a), color_a: ma?.combo ?? null, jugador_b: jug.get(p.jugador_b), color_b: mb?.combo ?? null,
      ganador: jug.get(p.ganador_id), empieza: p.empieza_id == null ? null : jug.get(p.empieza_id),
      duracion_min: p.duracion_min
    });
    for (const [m, id, prestado] of [[ma, p.jugador_a, p.mazo_prestado_a], [mb, p.jugador_b, p.mazo_prestado_b]]) {
      filasPartida.push({
        partida_id: p.id, evento_id: e.id, evento: e.nombre, fecha: e.fecha, jugador: jug.get(id), combo: m?.combo ?? null,
        prestado: prestado === true || !m, // exilio o mazo prestado: fuera de las estadísticas de color
        gano: p.ganador_id === id ? 1 : 0,
        empezo: p.empieza_id == null ? null : p.empieza_id === id,
        duracion_min: p.duracion_min
      });
    }
  }

  const fechas = evs.map((e) => e.fecha.getTime());
  return {
    meta: raw.meta ?? null,
    eventos: evs, mazos, filasEnf, partidas, filasPartida,
    jugadores: [...jug.values()],
    fechaMin: new Date(Math.min(...fechas)),
    fechaMax: new Date(Math.max(...fechas))
  };
}

/** Filtra todas las colecciones por rango de fechas (fecha del evento, inclusive). */
export function filtrarFechas(datos, {desde, hasta}) {
  const ok = (x) => x.fecha >= desde && x.fecha <= hasta;
  return {
    ...datos,
    eventos: datos.eventos.filter(ok),
    mazos: datos.mazos.filter(ok),
    filasEnf: datos.filasEnf.filter(ok),
    partidas: datos.partidas.filter(ok),
    filasPartida: datos.filasPartida.filter(ok)
  };
}

export const desvioPoblacional = (xs) => {
  if (!xs.length) return NaN;
  const m = mean(xs);
  return Math.sqrt(mean(xs, (x) => (x - m) ** 2));
};

export function resumen({eventos, partidas}) {
  return {
    partidas: partidas.length,
    eventos: eventos.length,
    duracion: mean(partidas, (p) => p.duracion_min) ?? NaN
  };
}

/** KDE gaussiano con ancho de banda de Silverman (1.06·σ·n^-1/5), evaluado en una grilla. */
export function kde(valores, puntos = 200) {
  const n = valores.length;
  if (n < 2) return [];
  const sd = desvioPoblacional(valores) || 1;
  const h = 1.06 * sd * n ** -0.2;
  const min = Math.max(0, Math.min(...valores) - 3 * h);
  const max = Math.max(...valores) + 3 * h;
  const c = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return Array.from({length: puntos}, (_, i) => {
    const x = min + ((max - min) * i) / (puntos - 1);
    let s = 0;
    for (const v of valores) s += Math.exp(-0.5 * ((x - v) / h) ** 2);
    return {x, y: c * s};
  });
}

/** Por combinación de colores: mazos, winrate de enfrentamientos y winrate de partidas. */
export function porCombinacion({mazos, filasEnf, filasPartida}) {
  // Los jugadores sin colores declarados cuentan como inscriptos pero no entran a las estadísticas de color.
  const m = rollup(mazos.filter((d) => d.combo), (v) => v.length, (d) => d.combo);
  const e = rollup(filasEnf.filter((d) => d.combo), (v) => ({jugadas: v.length, ganadas: sum(v, (d) => d.gano)}), (d) => d.combo);
  const p = rollup(filasPartida.filter((d) => !d.prestado && d.combo), (v) => ({jugadas: v.length, ganadas: sum(v, (d) => d.gano)}), (d) => d.combo);
  return Array.from(m, ([combo, mazosN]) => {
    const ee = e.get(combo) ?? {jugadas: 0, ganadas: 0};
    const pp = p.get(combo) ?? {jugadas: 0, ganadas: 0};
    return {
      combo, mazos: mazosN,
      enf_jugadas: ee.jugadas, enf_ganadas: ee.ganadas, wr_enf: ee.jugadas ? ee.ganadas / ee.jugadas : null,
      part_jugadas: pp.jugadas, part_ganadas: pp.ganadas, wr_part: pp.jugadas ? pp.ganadas / pp.jugadas : null
    };
  });
}

/** Una fila por evento, con la duración media de partida y su desvío estándar. */
export function serieEventos({eventos, partidas}) {
  const dur = group(partidas, (p) => p.evento_id);
  return eventos
    .map((e) => {
      const ds = (dur.get(e.id) ?? []).map((p) => p.duracion_min);
      return {
        evento: e.nombre, fecha: e.fecha, inscriptos: e.inscriptos, duracion_draft: e.duracion_draft_min,
        duracion_partida: ds.length ? mean(ds) : null, desvio_partida: ds.length ? desvioPoblacional(ds) : null, n: ds.length
      };
    })
    .sort((a, b) => a.fecha - b.fecha);
}

/**
 * Boxplot de la duración de partida por evento: mediana, cuartiles (método lineal, tipo 7), bigotes hasta el
 * último dato dentro de 1,5·RIC y atípicos como puntos.
 */
export function boxplotsPorEvento({eventos, partidas}) {
  const g = group(partidas, (p) => p.evento_id);
  const cajas = [];
  const atipicos = [];
  for (const e of eventos) {
    const v = (g.get(e.id) ?? []).map((p) => p.duracion_min).sort((a, b) => a - b);
    if (!v.length) continue;
    const q1 = quantile(v, 0.25), mediana = quantile(v, 0.5), q3 = quantile(v, 0.75);
    const ric = q3 - q1;
    const dentro = v.filter((x) => x >= q1 - 1.5 * ric && x <= q3 + 1.5 * ric);
    cajas.push({evento: e.nombre, fecha: e.fecha, n: v.length, q1, mediana, q3, bigoteMin: dentro[0], bigoteMax: dentro.at(-1)});
    for (const x of v) if (x < q1 - 1.5 * ric || x > q3 + 1.5 * ric) atipicos.push({evento: e.nombre, fecha: e.fecha, valor: x});
  }
  return {cajas, atipicos};
}

/**
 * Winrate de partidas por jugador JUGANDO PRIMERO (el que empezó la partida) y ROBANDO PRIMERO (el que no empezó).
 * Solo partidas con dato de quién empezó (el dato falta en los primeros eventos). Un jugador entra en una
 * categoría solo si tiene al menos `minPartidas` partidas en ella.
 */
export function empezoPorJugador(filasPartida, minPartidas) {
  const salida = [];
  const g = group(filasPartida.filter((f) => f.empezo !== null), (f) => f.jugador, (f) => f.empezo);
  for (const [jugador, porCat] of g) {
    for (const [empezo, rows] of porCat) {
      if (rows.length >= minPartidas) {
        salida.push({jugador, categoria: empezo ? "Jugando primero" : "Robando primero", winrate: sum(rows, (r) => r.gano) / rows.length, n: rows.length});
      }
    }
  }
  return salida;
}

export const resumenCategoria = (filas, cat) => {
  const w = filas.filter((f) => f.categoria === cat).map((f) => f.winrate);
  return w.length ? {categoria: cat, media: mean(w), mediana: median(w), n: w.length} : null;
};

/** Un punto por jugador y evento: autoevaluación del mazo y winrate de partidas en ese evento. */
export function valoracionVsWinrate({mazos, filasPartida}) {
  const g = rollup(filasPartida.filter((d) => !d.prestado), (v) => ({n: v.length, wr: sum(v, (d) => d.gano) / v.length}), (d) => `${d.evento_id}:${d.jugador}`);
  return mazos
    .map((m) => ({m, r: g.get(`${m.evento_id}:${m.jugador}`)}))
    .filter(({r}) => r)
    .map(({m, r}) => ({jugador: m.jugador, evento: m.evento, autoevaluacion: m.autoevaluacion, winrate: r.wr, n: r.n}));
}

/** Por cubo: duración del draft (entre eventos) y de las partidas, con promedio y desvío. */
export function porCubo({eventos, partidas}) {
  const draft = group(eventos, (e) => e.cubo);
  const part = group(partidas, (p) => p.cubo);
  const cubos = [...new Set(eventos.map((e) => e.cubo))].sort();
  const fila = (cubo, xs) => ({cubo, media: mean(xs), desvio: desvioPoblacional(xs), n: xs.length});
  return {
    draft: cubos.filter((c) => draft.get(c)).map((c) => fila(c, draft.get(c).map((e) => e.duracion_draft_min))),
    partida: cubos.filter((c) => part.get(c)).map((c) => fila(c, part.get(c).map((p) => p.duracion_min)))
  };
}

export const porJugador = (filasPartida) =>
  Array.from(group(filasPartida, (f) => f.jugador), ([jugador, rows]) => ({
    jugador,
    jugadas: rows.length,
    ganadas: sum(rows, (f) => f.gano),
    winrate: sum(rows, (f) => f.gano) / rows.length,
    duracion: mean(rows, (f) => f.duracion_min)
  }));
