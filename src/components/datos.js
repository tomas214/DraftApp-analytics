// Transformaciones comunes. Las páginas solo dependen de este esquema, no del origen del dato.
import {rollup, sum, mean, group} from "npm:d3-array";
import {nombreColor} from "./tema.js";

/** Convierte el JSON crudo en filas "por jugador" (una fila por jugador y partida). */
export function prepararDatos(raw) {
  const jug = new Map(raw.jugadores.map((j) => [j.id, j.nombre]));
  const eve = new Map(raw.eventos.map((e) => [e.id, {...e, fecha: new Date(e.fecha)}]));
  const enf = new Map(raw.enfrentamientos.map((e) => [e.id, e]));
  const filas = [];
  for (const p of raw.partidas) {
    const en = enf.get(p.enfrentamiento_id);
    const ev = eve.get(en.evento_id);
    for (const lado of ["a", "b"]) {
      const otro = lado === "a" ? "b" : "a";
      const gano = p.ganador_id === p[`jugador_${lado}`];
      filas.push({
        partida_id: p.id,
        evento_id: ev.id,
        evento: ev.nombre,
        formato: ev.formato,
        fecha: ev.fecha,
        ronda: en.ronda,
        partida: p.numero,
        jugador: jug.get(p[`jugador_${lado}`]),
        rival: jug.get(p[`jugador_${otro}`]),
        color: nombreColor(p[`color_${lado}`]),
        color_rival: nombreColor(p[`color_${otro}`]),
        resultado: gano ? "Ganada" : "Perdida",
        gano: gano ? 1 : 0,
        duracion_min: p.duracion_min
      });
    }
  }
  const fechas = raw.eventos.map((e) => new Date(e.fecha).getTime());
  return {
    filas,
    jugadores: raw.jugadores.map((j) => j.nombre),
    colores: [...new Set(filas.map((f) => f.color))],
    fechaMin: new Date(Math.min(...fechas)),
    fechaMax: new Date(Math.max(...fechas))
  };
}

/** Aplica los filtros globales (rango de fechas, jugadores y colores). */
export function filtrar(filas, {desde, hasta, jugadores, colores}) {
  const js = new Set(jugadores);
  const cs = new Set(colores);
  return filas.filter((f) => f.fecha >= desde && f.fecha <= hasta && js.has(f.jugador) && cs.has(f.color));
}

export function resumen(filas) {
  const ganadas = sum(filas, (f) => f.gano);
  return {
    partidas: new Set(filas.map((f) => f.partida_id)).size,
    ganadas,
    winrate: filas.length ? ganadas / filas.length : NaN,
    duracion: mean(filas, (f) => f.duracion_min) ?? NaN,
    eventos: new Set(filas.map((f) => f.evento_id)).size,
    jugadores: new Set(filas.map((f) => f.jugador)).size
  };
}

const agg = (rows) => ({
  jugadas: rows.length,
  ganadas: sum(rows, (f) => f.gano),
  winrate: sum(rows, (f) => f.gano) / rows.length,
  duracion: mean(rows, (f) => f.duracion_min)
});

export const porJugador = (filas) =>
  Array.from(group(filas, (f) => f.jugador), ([jugador, rows]) => ({jugador, ...agg(rows)}));

export const porEvento = (filas) =>
  Array.from(group(filas, (f) => f.evento_id), ([, rows]) => ({
    evento: rows[0].evento,
    fecha: rows[0].fecha,
    ...agg(rows)
  })).sort((a, b) => a.fecha - b.fecha);

export const porJugadorColor = (filas) =>
  Array.from(rollup(filas, agg, (f) => f.jugador, (f) => f.color).entries()).flatMap(([jugador, m]) =>
    Array.from(m, ([color, v]) => ({jugador, color, ...v}))
  );
