// Pruebas del verificador de dist. Correr con: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {escanear} from "../scripts/verificar-dist.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEC = {contraseña: "clave-ultra-secreta", host: "db.secreto-host.example", usuario: "rol_secreto.proyecto"};

function dist(archivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-"));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const f = path.join(dir, ruta);
    fs.mkdirSync(path.dirname(f), {recursive: true});
    fs.writeFileSync(f, contenido);
  }
  return dir;
}

test("dist limpio: sin hallazgos", () => {
  const d = dist({"index.html": "<p>Resumen 123 partidas</p>", "_file/data/draftapp.json": '{"jugadores":[{"id":1,"nombre":"Jugador 1"}]}'});
  assert.equal(escanear(d, SEC).size, 0);
});

test("detecta cada tipo de hallazgo", () => {
  const casos = [
    ["contraseña", `x ${SEC.contraseña} y`],
    ["contraseña", `x ${Buffer.from(SEC.contraseña).toString("base64")} y`],
    ["host", `https://${SEC.host}/`],
    ["usuario", `user=${SEC.usuario}`],
    ["uuid", "id 123e4567-e89b-12d3-a456-426614174000 fin"],
    ["correo electrónico", "contacto: alguien.prueba@ejemplo.com"]
  ];
  for (const [tipo, contenido] of casos) {
    const h = escanear(dist({"data.json": contenido}), SEC);
    assert.ok(h.has(tipo), `no detectó ${tipo}`);
  }
});

test("en librerías de terceros (_npm, _observablehq) no se buscan UUID ni correos, pero sí secretos", () => {
  const d = dist({"_npm/lib/x.js": "// autor: persona@ejemplo.org 123e4567-e89b-12d3-a456-426614174000", "index.html": "ok"});
  assert.equal(escanear(d, SEC).size, 0);
  assert.ok(escanear(dist({"_npm/lib/x.js": SEC.contraseña}), SEC).has("contraseña"));
});

test("la CLI falla, imprime solo el TIPO y nunca el valor encontrado", () => {
  const d = dist({"a.html": `fuga ${SEC.contraseña} y ${SEC.host} y persona@ejemplo.com`});
  const r = spawnSync(process.execPath, ["scripts/verificar-dist.mjs", d], {
    cwd: RAIZ,
    env: {PATH: process.env.PATH, ANALYTICS_DB_PASSWORD: SEC.contraseña, ANALYTICS_DB_HOST: SEC.host, ANALYTICS_DB_USER: SEC.usuario},
    encoding: "utf8"
  });
  assert.equal(r.status, 1);
  const salida = r.stdout + r.stderr;
  assert.match(salida, /contraseña/);
  assert.match(salida, /correo electrónico/);
  for (const v of [SEC.contraseña, SEC.host, "persona@ejemplo.com"]) assert.ok(!salida.includes(v), "la salida imprimió un valor encontrado");
});

test("la CLI sin las variables de credenciales falla (no da un ok vacío)", () => {
  const r = spawnSync(process.execPath, ["scripts/verificar-dist.mjs", dist({"a.html": "x"})], {cwd: RAIZ, env: {PATH: process.env.PATH}, encoding: "utf8"});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /faltan/);
});
