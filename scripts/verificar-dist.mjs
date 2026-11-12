// Falla si el sitio construido (dist/) contiene la contraseña, el host o el usuario de la base, un UUID o algo con forma de correo.
// NUNCA imprime lo encontrado: solo el TIPO de hallazgo y la cantidad de archivos afectados.
//
// Uso (CI):   ANALYTICS_DB_PASSWORD=... ANALYTICS_DB_HOST=... ANALYTICS_DB_USER=... node scripts/verificar-dist.mjs [dist]
//             Sin las tres variables NO se verifica nada y el script FALLA (para no dar un "ok" vacío).
// Uso (local): node scripts/verificar-dist.mjs dist --sin-secretos   (solo UUID y correos)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// Los UUID y correos se buscan en los archivos propios del sitio, no en las librerías empaquetadas (dist/_npm, dist/_observablehq),
// donde pueden aparecer por casualidad (avisos de licencia, constantes). Los secretos se buscan en TODOS los archivos.
const TERCEROS = new Set(["_npm", "_observablehq"]);
const RE_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

function* archivos(dir, raiz = dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) yield* archivos(ruta, raiz);
    else yield {ruta, propio: !TERCEROS.has(path.relative(raiz, ruta).split(path.sep)[0])};
  }
}

const variantes = (s) => [...new Set([s, encodeURIComponent(s), Buffer.from(s).toString("base64")])].filter((v) => v.length >= 3);

/**
 * @param dir       carpeta a revisar
 * @param secretos  {contraseña, host, usuario} (pueden faltar: se omiten)
 * @returns {Map<string, number>} tipo de hallazgo -> cantidad de archivos afectados (nunca el contenido)
 */
export function escanear(dir, secretos = {}) {
  const hallazgos = new Map();
  const marcar = (tipo) => hallazgos.set(tipo, (hallazgos.get(tipo) ?? 0) + 1);
  const buscados = Object.entries(secretos).filter(([, v]) => v).map(([tipo, v]) => [tipo, variantes(v)]);
  for (const {ruta, propio} of archivos(dir)) {
    const texto = fs.readFileSync(ruta).toString("latin1");
    const tipos = new Set();
    for (const [tipo, vs] of buscados) if (vs.some((v) => texto.includes(v))) tipos.add(tipo);
    if (propio) {
      if (RE_UUID.test(texto)) tipos.add("uuid");
      if (RE_CORREO.test(texto)) tipos.add("correo electrónico");
    }
    for (const t of tipos) marcar(t);
  }
  return hallazgos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sinSecretos = args.includes("--sin-secretos");
  const dir = args.find((a) => !a.startsWith("--")) ?? "dist";
  const secretos = {
    contraseña: process.env.ANALYTICS_DB_PASSWORD,
    host: process.env.ANALYTICS_DB_HOST,
    usuario: process.env.ANALYTICS_DB_USER
  };
  if (!sinSecretos && Object.values(secretos).some((v) => !v)) {
    console.error("FALLO: faltan ANALYTICS_DB_PASSWORD, ANALYTICS_DB_HOST o ANALYTICS_DB_USER: no se puede verificar que dist esté limpio.");
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`FALLO: no existe la carpeta ${dir}.`);
    process.exit(1);
  }
  const hallazgos = escanear(dir, sinSecretos ? {} : secretos);
  if (hallazgos.size) {
    for (const [tipo, n] of hallazgos) console.error(`FALLO: ${dir} contiene ${tipo} (en ${n} archivo${n === 1 ? "" : "s"}).`);
    process.exit(1);
  }
  console.log(`OK: ${dir} no contiene ${sinSecretos ? "UUID ni correos" : "credenciales de la base, UUID ni correos"}.`);
}
