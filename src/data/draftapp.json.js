// Data loader SINTÉTICO y determinístico (semilla fija) para DraftApp.
// Escribe un JSON a stdout; Observable Framework lo expone como FileAttachment("data/draftapp.json").
//
// Esquema (contrato que deben respetar los datos reales):
//   jugadores:       {id, nombre}
//   eventos:         {id, nombre, fecha (YYYY-MM-DD), formato}
//   enfrentamientos: {id, evento_id, ronda, jugador_a, jugador_b, ganador_id}
//   partidas:        {id, enfrentamiento_id, numero, jugador_a, jugador_b, ganador_id,
//                     duracion_min, color_a, color_b}      // color: W | U | B | R | G

const SEMILLA = 20260101;
const N_JUGADORES = 12;
const N_EVENTOS = 20;
const COLORES = ["W", "U", "B", "R", "G"];
const FORMATOS = ["Booster Draft", "Cube", "Sealed"];

// PRNG mulberry32
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEMILLA);
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = (a) => a[Math.floor(rand() * a.length)];
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const jugadores = Array.from({length: N_JUGADORES}, (_, i) => ({id: i + 1, nombre: `Jugador ${i + 1}`}));
const habilidad = new Map(jugadores.map((j) => [j.id, gauss() * 0.7]));

const eventos = [];
const enfrentamientos = [];
const partidas = [];
let idEnf = 1;
let idPartida = 1;
const inicio = Date.UTC(2026, 0, 3);

for (let e = 1; e <= N_EVENTOS; e++) {
  const fecha = new Date(inicio + (e - 1) * 14 * 86400000 + Math.floor(rand() * 3) * 86400000);
  eventos.push({
    id: e,
    nombre: `Draft ${String(e).padStart(2, "0")}`,
    fecha: fecha.toISOString().slice(0, 10),
    formato: pick(FORMATOS)
  });

  const n = pick([6, 8, 8, 10]);
  const participantes = shuffle(jugadores.map((j) => j.id)).slice(0, n);
  const mazo = new Map(participantes.map((id) => [id, pick(COLORES)]));

  for (let ronda = 1; ronda <= 3; ronda++) {
    const orden = shuffle(participantes);
    for (let i = 0; i + 1 < orden.length; i += 2) {
      const a = orden[i];
      const b = orden[i + 1];
      const pA = 1 / (1 + Math.exp(-(habilidad.get(a) - habilidad.get(b)) * 1.4));
      let vA = 0;
      let vB = 0;
      let numero = 0;
      const idE = idEnf++;
      while (vA < 2 && vB < 2) {
        numero++;
        const gana = rand() < pA ? a : b;
        gana === a ? vA++ : vB++;
        partidas.push({
          id: idPartida++,
          enfrentamiento_id: idE,
          numero,
          jugador_a: a,
          jugador_b: b,
          ganador_id: gana,
          duracion_min: Math.round(Math.max(8, 24 + gauss() * 7 + (numero === 3 ? 6 : 0))),
          color_a: mazo.get(a),
          color_b: mazo.get(b)
        });
      }
      enfrentamientos.push({
        id: idE,
        evento_id: e,
        ronda,
        jugador_a: a,
        jugador_b: b,
        ganador_id: vA > vB ? a : b
      });
    }
  }
}

process.stdout.write(JSON.stringify({jugadores, eventos, enfrentamientos, partidas}));
