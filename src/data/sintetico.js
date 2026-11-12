// Generador SINTÉTICO y determinístico (semilla fija). Lo usa src/data/draftapp.json.js cuando no hay credenciales de la base.
// Produce el MISMO esquema que las tablas publicadas por la base real (docs-analytics/contrato.md del repo DraftApp), de modo que
// el sitio funciona igual con ambas fuentes sin tocar las páginas.
//
// ESQUEMA (fechas "YYYY-MM-DD"; ids enteros opacos):
//
// meta:            {fuente, refrescado_en, extraido_en, registro_limpieza}
//     fuente              "sintetico" | "real"
//     refrescado_en       ISO UTC del último refresco de la base (en sintético, una fecha fija derivada de los datos)
//     extraido_en         ISO UTC del momento de la extracción
//     registro_limpieza   [{concepto, cantidad}]  cantidad es TEXTO; las cantidades menores a 5 vienen como "<5"
// jugadores:       {id, nombre}                         id 1..n consecutivo (puesto de ESTA publicación: puede cambiar entre refrescos)
// cubos:           {id, nombre}                         id 1..m consecutivo; nombre "Cubo A", "Cubo B", ...
// eventos:         {id, nombre, fecha, event_type, es_oficial, estado, competition_format, match_format, cubo_id, duracion_draft_min}
//     fecha               día del DRAFT; es la fecha de TODAS las partidas del evento (no existe fecha_juego)
//     event_type          draft | tournament | pepidraft        (la base nunca publica two_headed_giant)
//     estado              drafting | playing | completed | concluded
//     competition_format  round_robin | swiss | zones_knockout | knockout
//     match_format        bo1 | bo2 | bo3
//     cubo_id             null si el evento no tiene cubo (o si el creador del cubo pidió exclusión)
//     duracion_draft_min  minutos, null si no es confiable
// participaciones: {evento_id, jugador_id, rol, colores, autoevaluacion}
//     rol             player | ghost | exile
//     colores         combinación exacta ordenada W-U-B-R-G-C ("WUG"); null si rol no es player
//     autoevaluacion  1..10 o null (dato sensible)
// enfrentamientos: {id, evento_id, ronda, fase, etapa, jugador_a, jugador_b, ganador_id, resultado, con_mazo_prestado}
//     ronda       solo suizo; null en el resto
//     fase        regular | zona | interzonal | llave | desempate | top4 | desempate_1er_puesto | desempate_4to_puesto | segunda_chance | otro
//     etapa       round_of_16 | quarter | semi | final | tercer_puesto | null
//     jugador_a < jugador_b
//     resultado   victoria | empate | pendiente   (ganador_id solo con victoria)
// partidas:        {id, enfrentamiento_id, numero, tipo, estado, jugador_a, jugador_b, ganador_id, empieza_id, duracion_min,
//                   mazo_prestado_a, mazo_prestado_b}
//     tipo        draft | final | tiebreak               (nunca revenge)
//     estado      completed
//     empieza_id  null = sin dato (no existe en los primeros eventos)
//
// QUÉ NO SE PUBLICA (igual que la base real): walkovers (ni el cruce ni sus partidas), "se fue", venganzas, eventos de prueba y de
// Gigante de dos cabezas. Aquí se SIMULAN los walkovers solo para contarlos en registro_limpieza.

const SEMILLA = 20260101;
const N_JUGADORES = 12;
const N_EVENTOS = 22;
const PRIMER_EVENTO_CON_EMPIEZA = 9;
const ORDEN_COLORES = ["W", "U", "B", "R", "G", "C"];
const UMBRAL_REGISTRO = 5;
const DIA = 86400000;

// Mazos realistas: pocas combinaciones frecuentes, monocolores raros y muchas combinaciones ausentes.
const PESOS_MAZOS = {
  BG: 9, WU: 8, UB: 7, BR: 6, WUG: 6, BRG: 6, UBR: 5, RG: 4, WG: 3, WBG: 2, UR: 2, WB: 1, WBR: 1, URG: 1, B: 1, G: 1, UBC: 1
};

/** Cantidad como texto: menores al umbral se muestran "<5" (misma regla que el registro de limpieza de la base). */
export const textoCantidad = (n) => (n < UMBRAL_REGISTRO ? `<${UMBRAL_REGISTRO}` : String(n));

export function generarSintetico() {
  let seed = SEMILLA;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const shuffle = (a) => {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const total = Object.values(PESOS_MAZOS).reduce((s, x) => s + x, 0);
  const mazoAleatorio = () => {
    let r = rand() * total;
    for (const [combo, peso] of Object.entries(PESOS_MAZOS)) {
      if ((r -= peso) < 0) return ORDEN_COLORES.filter((c) => combo.includes(c)).join("");
    }
    return "BG";
  };

  const jugadores = Array.from({length: N_JUGADORES}, (_, i) => ({id: i + 1, nombre: `Jugador ${i + 1}`}));
  const habilidad = new Map(jugadores.map((j) => [j.id, gauss() * 0.7]));
  const cubos = ["A", "B", "C", "D", "E"].map((x, i) => ({id: i + 1, nombre: `Cubo ${x}`}));
  const efectoCubo = new Map(cubos.map((c) => [c.id, {draft: gauss() * 8, partida: gauss() * 3}]));

  const eventos = [];
  const participaciones = [];
  const enfrentamientos = [];
  const partidas = [];
  let idEnf = 1;
  let idPartida = 1;
  let walkoverEnf = 0;
  let walkoverPartidas = 0;
  const inicio = Date.UTC(2026, 0, 3);

  for (let e = 1; e <= N_EVENTOS; e++) {
    const enCurso = e === N_EVENTOS; // el último evento está en juego: tiene un cruce pendiente
    const fechaMs = inicio + (e - 1) * 11 * DIA + Math.floor(rand() * 3) * DIA;
    const cubo = pick(cubos).id;
    const matchFormat = pick(["bo3", "bo3", "bo3", "bo2", "bo1"]);
    const competition = pick(["round_robin", "swiss"]);
    const n = pick([6, 8, 8, 10]);
    const inscriptos = shuffle(jugadores.map((j) => j.id)).slice(0, n);
    eventos.push({
      id: e,
      nombre: `Evento ${String(e).padStart(2, "0")}`,
      fecha: iso(fechaMs),
      event_type: pick(["draft", "draft", "draft", "tournament", "pepidraft"]),
      es_oficial: true,
      estado: enCurso ? "playing" : "completed",
      competition_format: competition,
      match_format: matchFormat,
      cubo_id: cubo,
      duracion_draft_min: Math.round(clamp(75 + efectoCubo.get(cubo).draft + gauss() * 10 + (n - 8) * 4, 35, 150))
    });

    // Roles: un fantasma o un exilio ocasional (el exilio juega con mazo prestado y sin colores propios).
    const roles = new Map(inscriptos.map((id) => [id, "player"]));
    if (rand() < 0.15) roles.set(inscriptos[inscriptos.length - 1], "ghost");
    else if (rand() < 0.15) roles.set(inscriptos[inscriptos.length - 1], "exile");
    for (const id of inscriptos) {
      const rol = roles.get(id);
      participaciones.push({
        evento_id: e,
        jugador_id: id,
        rol,
        colores: rol === "player" ? mazoAleatorio() : null,
        // Relación ascendente débil con la habilidad (y por lo tanto con el winrate)
        autoevaluacion: Math.round(clamp(5.5 + habilidad.get(id) * 1.6 + gauss() * 2, 1, 10))
      });
    }
    const juegan = inscriptos.filter((id) => roles.get(id) !== "ghost");
    const leaver = rand() < 0.3 ? juegan[0] : null; // se va antes de la última ronda: su cruce es walkover (no se publica)
    const victorias = new Map(juegan.map((id) => [id, 0]));
    const hayEmpieza = e >= PRIMER_EVENTO_CON_EMPIEZA;

    // a y b pueden venir en cualquier orden; se publican ordenados por id.
    function jugarSerie({a, b, ronda, fase, etapa, formato, tipo, walkover = false, soloUna = false}) {
      if (walkover) {
        walkoverEnf++;
        walkoverPartidas++;
        return b;
      }
      const pA = 1 / (1 + Math.exp(-(habilidad.get(a) - habilidad.get(b)) * 1.4));
      const maxPartidas = formato === "bo1" || soloUna ? 1 : formato === "bo2" ? 2 : 3;
      let vA = 0;
      let vB = 0;
      let numero = 0;
      const idE = idEnf++;
      let prestado = false;
      const juegos = [];
      while (numero < maxPartidas && (formato === "bo2" || soloUna || (vA < 2 && vB < 2))) {
        numero++;
        const empieza = hayEmpieza ? (rand() < 0.5 ? a : b) : null;
        const p = clamp(pA + (empieza === a ? 0.06 : empieza === b ? -0.06 : 0), 0.03, 0.97);
        const gana = rand() < p ? a : b;
        gana === a ? vA++ : vB++;
        const largo = rand() < 0.3;
        const duracion = Math.round(clamp((largo ? 37 : 22) + efectoCubo.get(cubo).partida + gauss() * (largo ? 8 : 5.5), 6, 95));
        const presA = roles.get(a) === "exile" || rand() < 0.03;
        const presB = roles.get(b) === "exile" || rand() < 0.03;
        prestado ||= presA || presB;
        juegos.push({numero, gana, empieza, duracion, presA, presB});
      }
      const ganador = soloUna ? null : vA === vB ? null : vA > vB ? a : b;
      const resultado = soloUna ? "pendiente" : ganador === null ? "empate" : "victoria";
      const [ja, jb] = a < b ? [a, b] : [b, a];
      enfrentamientos.push({
        id: idE, evento_id: e, ronda, fase, etapa, jugador_a: ja, jugador_b: jb,
        ganador_id: ganador, resultado, con_mazo_prestado: prestado
      });
      for (const g of juegos) {
        partidas.push({
          id: idPartida++, enfrentamiento_id: idE, numero: g.numero, tipo, estado: "completed", jugador_a: ja, jugador_b: jb,
          ganador_id: g.gana, empieza_id: g.empieza, duracion_min: g.duracion,
          mazo_prestado_a: a < b ? g.presA : g.presB, mazo_prestado_b: a < b ? g.presB : g.presA
        });
      }
      return ganador;
    }

    const rondas = enCurso ? 2 : 3;
    for (let r = 1; r <= rondas; r++) {
      const orden = shuffle(juegan);
      for (let i = 0; i + 1 < orden.length; i += 2) {
        let [a, b] = [orden[i], orden[i + 1]];
        const walkover = r === rondas && (a === leaver || b === leaver);
        if (walkover && b === leaver) [a, b] = [b, a]; // a = el que se fue; b = quien gana por walkover
        const ganador = jugarSerie({
          a, b, ronda: competition === "swiss" ? r : null, fase: "regular", etapa: null, formato: matchFormat, tipo: "draft", walkover
        });
        if (ganador) victorias.set(ganador, victorias.get(ganador) + 1);
      }
    }
    if (enCurso) {
      // un cruce de la última ronda sin resolver: solo una partida jugada
      const [a, b] = shuffle(juegan);
      jugarSerie({a, b, ronda: competition === "swiss" ? 3 : null, fase: "regular", etapa: null, formato: "bo3", tipo: "draft", soloUna: true});
    } else {
      const top = [...victorias.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
      if (n >= 8 && top.length >= 2) {
        if (rand() < 0.25) jugarSerie({a: top[0], b: top[1], ronda: null, fase: "desempate", etapa: null, formato: "bo1", tipo: "tiebreak"});
        jugarSerie({a: top[0], b: top[1], ronda: null, fase: "top4", etapa: "final", formato: "bo3", tipo: "final"});
      }
    }
  }

  // Los eventos de un mismo cubo no repiten duración de draft (evita desvíos estándar artificialmente nulos).
  const vistas = new Map();
  for (const ev of eventos) {
    const usadas = vistas.get(ev.cubo_id) ?? new Set();
    while (usadas.has(ev.duracion_draft_min)) ev.duracion_draft_min += 1 + Math.floor(rand() * 3);
    usadas.add(ev.duracion_draft_min);
    vistas.set(ev.cubo_id, usadas);
  }

  const sinEmpieza = partidas.filter((p) => p.empieza_id === null).length;
  const registro = {
    enfrentamientos_walkover_no_publicados: walkoverEnf,
    eventos_duracion_draft_fuera_de_rango: 0,
    partidas_de_cruce_no_publicado: 0,
    partidas_de_origen_importado: 0,
    partidas_duracion_fuera_de_rango: 0,
    partidas_sin_dato_de_quien_empieza: sinEmpieza,
    partidas_walkover_no_publicadas: walkoverPartidas,
    participaciones_player_sin_colores: 0
  };
  const ultimo = Date.parse(eventos.at(-1).fecha);
  const refrescado = new Date(ultimo + DIA + 8.5 * 3600000).toISOString(); // 08:30 UTC del día siguiente al último evento (determinístico)
  return {
    meta: {
      fuente: "sintetico",
      refrescado_en: refrescado,
      extraido_en: refrescado,
      registro_limpieza: Object.entries(registro).map(([concepto, n]) => ({concepto, cantidad: textoCantidad(n)}))
    },
    jugadores, cubos, eventos, participaciones, enfrentamientos, partidas
  };
}
