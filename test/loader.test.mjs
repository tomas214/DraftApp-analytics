// Pruebas del loader con un CLIENTE FALSO (sin base real). Correr con: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import {TLSSocket} from "node:tls";
import {X509Certificate} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {extraer, validarDatos, conectar, leerCertificado, sanitizar, COLUMNAS_ESPERADAS, MAX_ANTIGUEDAD_HORAS, ErrorDatos} from "../src/data/extraccion.js";
import {obtenerDatos} from "../src/data/fuente.js";
import {generarSintetico} from "../src/data/sintetico.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AHORA = new Date("2026-11-12T09:00:00Z");
const HORAS = (h) => new Date(AHORA.getTime() - h * 3600000);

/** Datos válidos mínimos; los bigint llegan como texto (como los entrega pg por defecto) para probar la conversión. */
function base() {
  return {
    refresco: [{refrescado_en: HORAS(1), vigente: true}],
    verificacion: [{chequeo: "privacidad:texto_con_uuid", ok: true}, {chequeo: "conciliacion:partidas", ok: true}],
    registro: [{concepto: "partidas_sin_dato_de_quien_empieza", cantidad: "<5"}, {concepto: "partidas_walkover_no_publicadas", cantidad: "12"}],
    jugadores: [{id: 1, nombre: "Jugador 1"}, {id: 2, nombre: "Jugador 2"}, {id: 3, nombre: "Jugador 3"}],
    cubos: [{id: 1, nombre: "Cubo A"}, {id: 2, nombre: "Cubo B"}],
    eventos: [
      {id: "281474976710655", nombre: "Evento 01", fecha: "2026-03-07", event_type: "draft", es_oficial: true, estado: "completed", competition_format: "swiss", match_format: "bo3", cubo_id: 1, duracion_draft_min: 90},
      {id: "12345", nombre: "Evento 02", fecha: "2026-03-21", event_type: "draft", es_oficial: true, estado: "playing", competition_format: "round_robin", match_format: "bo3", cubo_id: null, duracion_draft_min: null}
    ],
    participaciones: [
      {evento_id: "281474976710655", jugador_id: 1, rol: "player", colores: "WU", autoevaluacion: 7},
      {evento_id: "281474976710655", jugador_id: 2, rol: "player", colores: "BG", autoevaluacion: null},
      {evento_id: "12345", jugador_id: 3, rol: "exile", colores: null, autoevaluacion: 5}
    ],
    enfrentamientos: [
      {id: 10, evento_id: "281474976710655", ronda: 1, fase: "regular", etapa: null, jugador_a: 1, jugador_b: 2, ganador_id: 1, resultado: "victoria", con_mazo_prestado: false},
      {id: 11, evento_id: "12345", ronda: null, fase: "regular", etapa: null, jugador_a: 2, jugador_b: 3, ganador_id: null, resultado: "pendiente", con_mazo_prestado: true}
    ],
    partidas: [
      {id: 100, enfrentamiento_id: 10, numero: 1, tipo: "draft", estado: "completed", jugador_a: 1, jugador_b: 2, ganador_id: 1, empieza_id: 2, duracion_min: 25, mazo_prestado_a: false, mazo_prestado_b: false},
      {id: 101, enfrentamiento_id: 10, numero: 2, tipo: "draft", estado: "completed", jugador_a: 1, jugador_b: 2, ganador_id: 2, empieza_id: null, duracion_min: null, mazo_prestado_a: false, mazo_prestado_b: false}
    ]
  };
}

/** Cliente falso: responde según la tabla que menciona la consulta y registra todo lo ejecutado. */
function cliente(datos = base(), {sinColumnas = []} = {}) {
  const log = [];
  const tablaDe = {
    "analytics_control.refresco": "refresco", "analytics_control.verificacion": "verificacion", "analytics_control.registro_limpieza": "registro",
    "analytics.jugadores": "jugadores", "analytics.cubos": "cubos", "analytics.eventos": "eventos", "analytics.participaciones": "participaciones",
    "analytics.enfrentamientos": "enfrentamientos", "analytics.partidas": "partidas"
  };
  return {
    log,
    async query(sql) {
      log.push(sql);
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return {rows: []};
      if (sql.includes("information_schema.columns")) {
        const rows = [];
        for (const [tabla, cols] of Object.entries(COLUMNAS_ESPERADAS)) {
          const [esquema, nombre] = tabla.split(".");
          for (const c of cols) if (!sinColumnas.includes(`${tabla}.${c}`)) rows.push({table_schema: esquema, table_name: nombre, column_name: c});
        }
        return {rows};
      }
      for (const [tabla, clave] of Object.entries(tablaDe)) if (sql.includes(`from ${tabla}`)) return {rows: datos[clave]};
      throw new Error("consulta inesperada en la prueba");
    }
  };
}

const rechaza = (promesa, patron) => assert.rejects(promesa, (e) => e instanceof ErrorDatos && patron.test(e.message));

// ---- 1. datos válidos ----------------------------------------------------------------------------------------------------
test("datos válidos: transacción de solo lectura, tipos convertidos y meta", async () => {
  const c = cliente();
  const r = await extraer(c, {ahora: AHORA});
  assert.equal(c.log[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(c.log.at(-1), "COMMIT");
  assert.equal(c.log.filter((s) => /^(BEGIN|COMMIT)/.test(s)).length, 2, "una sola transacción");
  assert.equal(r.meta.fuente, "real");
  assert.equal(r.meta.refrescado_en, HORAS(1).toISOString());
  assert.equal(r.meta.extraido_en, AHORA.toISOString());
  assert.deepEqual(r.meta.registro_limpieza[0], {concepto: "partidas_sin_dato_de_quien_empieza", cantidad: "<5"}); // tal cual, sin recalcular
  assert.equal(r.eventos[0].id, 281474976710655);
  assert.equal(typeof r.eventos[0].id, "number");
  assert.equal(r.participaciones[0].evento_id, 281474976710655);
  assert.equal(r.eventos[0].fecha, "2026-03-07");
  assert.deepEqual(Object.keys(r).sort(), ["cubos", "enfrentamientos", "eventos", "jugadores", "meta", "participaciones", "partidas"]);
  const sqls = c.log.filter((s) => s.startsWith("select")).join("\n");
  assert.ok(!/\*/.test(sqls), "nunca select *: solo columnas explícitas");
});

test("el esquema del generador sintético pasa el MISMO validador que los datos reales", () => {
  const s = generarSintetico();
  assert.equal(s.meta.fuente, "sintetico");
  const {meta, ...tablas} = s;
  validarDatos(tablas);
  const claves = (tabla) => Object.keys(tabla[0]).sort();
  for (const [nombre, tabla] of [["analytics.jugadores", s.jugadores], ["analytics.eventos", s.eventos], ["analytics.participaciones", s.participaciones], ["analytics.enfrentamientos", s.enfrentamientos], ["analytics.partidas", s.partidas]]) {
    assert.deepEqual(claves(tabla), [...COLUMNAS_ESPERADAS[nombre]].sort(), `columnas de ${nombre}`);
  }
  assert.ok(s.partidas.every((p) => p.jugador_a < p.jugador_b));
  assert.ok(!JSON.stringify(s).includes("walkover\":"), "no hay campos es_walkover");
  assert.ok(s.meta.registro_limpieza.every((r) => typeof r.cantidad === "string"));
});

// ---- 2. refresco vencido -------------------------------------------------------------------------------------------------
test("refresco vencido (más de 36 horas) falla; justo dentro del margen pasa", async () => {
  assert.equal(MAX_ANTIGUEDAD_HORAS, 36);
  const viejo = base();
  viejo.refresco = [{refrescado_en: HORAS(37), vigente: true}];
  await rechaza(extraer(cliente(viejo), {ahora: AHORA}), /antigüedad/);
  const justo = base();
  justo.refresco = [{refrescado_en: HORAS(35), vigente: true}];
  assert.equal((await extraer(cliente(justo), {ahora: AHORA})).meta.fuente, "real");
});

test("refresco.vigente distinto de true falla, y se hace ROLLBACK", async () => {
  const d = base();
  d.refresco = [{refrescado_en: HORAS(1), vigente: false}];
  const c = cliente(d);
  await rechaza(extraer(c, {ahora: AHORA}), /NO están vigentes/);
  assert.equal(c.log.at(-1), "ROLLBACK");
});

// ---- 3. verificación con false ------------------------------------------------------------------------------------------
test("un chequeo de verificacion con ok = false falla y nombra el chequeo", async () => {
  const d = base();
  d.verificacion = [{chequeo: "privacidad:texto_con_uuid", ok: true}, {chequeo: "conciliacion:partidas", ok: false}];
  await rechaza(extraer(cliente(d), {ahora: AHORA}), /conciliacion:partidas/);
});

test("ok nulo también cuenta como fallo; verificacion vacía falla", async () => {
  const d = base();
  d.verificacion = [{chequeo: "x", ok: null}];
  await rechaza(extraer(cliente(d), {ahora: AHORA}), /ok distinto de true/);
  const v = base();
  v.verificacion = [];
  await rechaza(extraer(cliente(v), {ahora: AHORA}), /verificacion está vacía/);
});

// ---- 4. columna faltante ------------------------------------------------------------------------------------------------
test("columna faltante: falla con mensaje claro ANTES de leer ningún dato", async () => {
  const c = cliente(base(), {sinColumnas: ["analytics.partidas.empieza_id"]});
  await rechaza(extraer(c, {ahora: AHORA}), /analytics\.partidas\.empieza_id/);
  assert.ok(!c.log.some((s) => s.includes("from analytics.jugadores")), "no se leyó ninguna tabla");
  assert.equal(c.log.at(-1), "ROLLBACK");
});

// ---- 5. ids con huecos y demás integridad -------------------------------------------------------------------------------
test("id de jugador con huecos falla", async () => {
  const d = base();
  d.jugadores = [{id: 1, nombre: "Jugador 1"}, {id: 3, nombre: "Jugador 3"}];
  d.participaciones = d.participaciones.filter((p) => p.jugador_id !== 2);
  await rechaza(extraer(cliente(d), {ahora: AHORA}), /jugadores no son consecutivos/);
});

test("ids duplicados de cubo fallan", async () => {
  const d = base();
  d.cubos = [{id: 1, nombre: "Cubo A"}, {id: 1, nombre: "Cubo B"}];
  await rechaza(extraer(cliente(d), {ahora: AHORA}), /duplicados en cubos/);
});

test("tablas vacías fallan", async () => {
  for (const tabla of ["jugadores", "cubos", "eventos", "participaciones", "enfrentamientos", "partidas"]) {
    const d = base();
    d[tabla] = [];
    await assert.rejects(extraer(cliente(d), {ahora: AHORA}), (e) => e instanceof ErrorDatos, tabla);
  }
});

test("referencias a ids inexistentes fallan", async () => {
  const casos = [
    ["participaciones", (d) => (d.participaciones[0].jugador_id = 99), /participaciones\.jugador_id/],
    ["participaciones", (d) => (d.participaciones[0].evento_id = 7), /participaciones\.evento_id/],
    ["enfrentamientos", (d) => (d.enfrentamientos[0].jugador_b = 99), /enfrentamientos\.jugador_a\/jugador_b/],
    ["enfrentamientos", (d) => (d.enfrentamientos[0].ganador_id = 99), /enfrentamientos\.ganador_id/],
    ["partidas", (d) => (d.partidas[0].enfrentamiento_id = 999), /partidas\.enfrentamiento_id/],
    ["partidas", (d) => (d.partidas[0].empieza_id = 99), /partidas\.empieza_id/],
    ["eventos", (d) => (d.eventos[0].cubo_id = 99), /eventos\.cubo_id/]
  ];
  for (const [, mutar, patron] of casos) {
    const d = base();
    mutar(d);
    await rechaza(extraer(cliente(d), {ahora: AHORA}), patron);
  }
});

test("un id fuera del rango seguro de JavaScript falla", async () => {
  const d = base();
  d.eventos[0].id = "9007199254740993";
  await rechaza(extraer(cliente(d), {ahora: AHORA}), /rango seguro/);
});

// ---- 6. elección de fuente y manejo de credenciales ---------------------------------------------------------------------
const CRED = {ANALYTICS_DB_HOST: "db.secreto-host.example", ANALYTICS_DB_USER: "rol_secreto.proyecto", ANALYTICS_DB_PASSWORD: "clave-ultra-secreta"};

test("sin credenciales: sintético; con REQUIRE_REAL_DATA=1: falla", async () => {
  assert.equal((await obtenerDatos({})).meta.fuente, "sintetico");
  await rechaza(obtenerDatos({REQUIRE_REAL_DATA: "1"}), /REQUIRE_REAL_DATA=1/);
  await rechaza(obtenerDatos({REQUIRE_REAL_DATA: "1", ANALYTICS_DB_HOST: "x"}), /ANALYTICS_DB_USER, ANALYTICS_DB_PASSWORD/);
});

test("con credenciales extrae de la base y NUNCA cae al sintético si algo falla", async () => {
  const ok = await obtenerDatos(CRED, {conectarFn: async () => cliente(), ahora: AHORA});
  assert.equal(ok.meta.fuente, "real");
  const vencida = base();
  vencida.refresco = [{refrescado_en: HORAS(50), vigente: true}];
  await rechaza(obtenerDatos(CRED, {conectarFn: async () => cliente(vencida), ahora: AHORA}), /antigüedad/);
});

test("los errores nunca incluyen host, usuario ni contraseña", async () => {
  const conFuga = async () => {
    throw new Error(`connect ECONNREFUSED ${CRED.ANALYTICS_DB_HOST}:5432 usuario ${CRED.ANALYTICS_DB_USER} clave ${CRED.ANALYTICS_DB_PASSWORD}`);
  };
  await assert.rejects(obtenerDatos(CRED, {conectarFn: conFuga}), (e) => {
    for (const s of Object.values(CRED)) assert.ok(!e.message.includes(s), "el mensaje filtra un secreto");
    return true;
  });
  // conectar(): el error del cliente se reduce a su código
  class ClienteQueFalla {
    constructor() {}
    on() {}
    async connect() {
      const e = new Error(`getaddrinfo ENOTFOUND ${CRED.ANALYTICS_DB_HOST} (usuario ${CRED.ANALYTICS_DB_USER})`);
      e.code = "ENOTFOUND";
      throw e;
    }
  }
  await assert.rejects(
    conectar({host: CRED.ANALYTICS_DB_HOST, user: CRED.ANALYTICS_DB_USER, password: CRED.ANALYTICS_DB_PASSWORD, port: 5432, database: "postgres"}, ClienteQueFalla),
    (e) => {
      for (const s of Object.values(CRED)) assert.ok(!e.message.includes(s));
      return /ENOTFOUND/.test(e.message);
    }
  );
  // sanitizar() también cubre la versión codificada para URL
  const t = sanitizar(`postgres://u:${encodeURIComponent("a b/c")}@h`, ["a b/c"]);
  assert.ok(!t.includes("a%20b%2Fc"));
});

test("conectar(): timeout corto y tipos (bigint→Number, date→texto)", async () => {
  let opciones;
  class Espia {
    constructor(o) {
      opciones = o;
    }
    on() {}
    async connect() {}
    async query() {
      return {rows: []};
    }
    async end() {}
  }
  await conectar({host: "h", user: "u", password: "p", port: 5432, database: "postgres"}, Espia);
  assert.ok(opciones.connectionTimeoutMillis > 0 && opciones.connectionTimeoutMillis <= 15000);
  assert.equal(opciones.types.getTypeParser(20)("281474976710655"), 281474976710655);
  assert.equal(opciones.types.getTypeParser(1082)("2026-03-07"), "2026-03-07");
});

// ---- 6b. SSL verificado --------------------------------------------------------------------------------------------------
const CA_REAL = fs.readFileSync(path.join(RAIZ, "certs", "prod-ca-2021.crt"), "utf8");
const CRED_DB = {host: "h", user: "u", password: "p", port: 5432, database: "postgres"};

test("conectar(): las opciones ssl llegan con el certificado raíz del repo y rejectUnauthorized true", async () => {
  let opciones;
  class Espia {
    constructor(o) {
      opciones = o;
    }
    on() {}
    async connect() {}
    async query() {
      return {rows: []};
    }
    async end() {}
  }
  await conectar(CRED_DB, Espia);
  assert.equal(opciones.ssl.rejectUnauthorized, true);
  assert.equal(opciones.ssl.ca, CA_REAL, "ca = contenido de certs/prod-ca-2021.crt");
  assert.deepEqual(Object.keys(opciones.ssl).sort(), ["ca", "rejectUnauthorized"], "sin otras opciones (p. ej. checkServerIdentity): verificación de host por defecto");
});

test("certificado ausente, ilegible o inválido: la conexión falla y NUNCA se crea un cliente sin verificar", async () => {
  let creados = 0;
  class Espia {
    constructor() {
      creados++;
    }
    on() {}
    async connect() {}
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-"));
  const conClave = path.join(dir, "con-clave.crt");
  fs.writeFileSync(conClave, `${CA_REAL}\n-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n`);
  const vacio = path.join(dir, "vacio.crt");
  fs.writeFileSync(vacio, "");
  for (const ruta of [path.join(dir, "no-existe.crt"), conClave, vacio, dir]) {
    await rechaza(conectar(CRED_DB, Espia, {leerCa: () => leerCertificado(ruta)}), /certificado/);
  }
  assert.equal(creados, 0);
});

test("certificado ausente: la extracción FALLA (no cae al sintético ni a una conexión sin verificar)", async () => {
  const sinCa = (credenciales) => conectar(credenciales, class {}, {leerCa: () => leerCertificado(path.join(RAIZ, "certs", "no-existe.crt"))});
  await assert.rejects(obtenerDatos(CRED, {conectarFn: sinCa, ahora: AHORA}), (e) => {
    assert.ok(e instanceof ErrorDatos && /certificado raíz/.test(e.message));
    for (const s of Object.values(CRED)) assert.ok(!e.message.includes(s));
    return true;
  });
});

test("leerCertificado(): el archivo del repo es solo un certificado público", () => {
  const t = leerCertificado();
  assert.equal((t.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length, 1);
  assert.ok(!/PRIVATE KEY/.test(t));
  assert.equal(new X509Certificate(t).ca, true);
});

test("un error de TLS se reduce a su código, sin host ni usuario", async () => {
  class FallaTls {
    constructor() {}
    on() {}
    async connect() {
      const e = new Error(`Hostname/IP does not match certificate's altnames: Host: ${CRED.ANALYTICS_DB_HOST}. usuario ${CRED.ANALYTICS_DB_USER}`);
      e.code = "ERR_TLS_CERT_ALTNAME_INVALID";
      throw e;
    }
  }
  await assert.rejects(
    conectar({host: CRED.ANALYTICS_DB_HOST, user: CRED.ANALYTICS_DB_USER, password: CRED.ANALYTICS_DB_PASSWORD, port: 5432, database: "postgres"}, FallaTls),
    (e) => {
      for (const s of Object.values(CRED)) assert.ok(!e.message.includes(s));
      return /ERR_TLS_CERT_ALTNAME_INVALID/.test(e.message);
    }
  );
});

test("ninguna vía de escape: el código no contiene rejectUnauthorized en false ni variables/opciones que desactiven la verificación", () => {
  const prohibidos = [/rejectUnauthorized\s*:\s*false/, /NODE_TLS_REJECT_UNAUTHORIZED/, /sslmode\s*=\s*(disable|allow|prefer|require|no-verify)/i, /PGSSLMODE\s*[:=]\s*["']?(disable|allow|prefer|require)/, /ANALYTICS_DB_SSL/, /ANALYTICS_DB_CA/];
  const revisar = (dir) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) revisar(ruta);
      else if (/\.(js|mjs|yml|yaml)$/.test(e.name)) {
        const t = fs.readFileSync(ruta, "utf8");
        for (const re of prohibidos) assert.ok(!re.test(t), `${path.relative(RAIZ, ruta)} contiene ${re}`);
      }
    }
  };
  for (const d of ["src/data", "scripts", ".github"]) revisar(path.join(RAIZ, d));
});

test("TLS real: un servidor cuyo certificado NO está firmado por la raíz de Supabase es rechazado (verificación activa)", {skip: spawnSync("openssl", ["version"]).status !== 0 && "openssl no disponible"}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tls-"));
  const gen = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], {encoding: "utf8"});
  assert.equal(gen.status, 0);
  // Servidor mínimo con el saludo SSLRequest de PostgreSQL: responde "S" y pasa a TLS con un certificado AUTOFIRMADO.
  const servidor = net.createServer((socket) => {
    socket.once("data", () => {
      socket.write("S");
      const tls = new TLSSocket(socket, {isServer: true, key: fs.readFileSync(path.join(dir, "k.pem")), cert: fs.readFileSync(path.join(dir, "c.pem"))});
      tls.on("error", () => {});
      tls.on("data", () => {});
    });
    socket.on("error", () => {});
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  try {
    const puerto = servidor.address().port;
    await assert.rejects(
      conectar({host: "127.0.0.1", user: "u", password: "p", port: puerto, database: "postgres"}),
      (e) => e instanceof ErrorDatos && /\(SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(e.message) && !e.message.includes("127.0.0.1")
    );
  } finally {
    servidor.close();
  }
});

// ---- 7. el loader como proceso --------------------------------------------------------------------------------------------
const correrLoader = (env) =>
  spawnSync(process.execPath, ["src/data/draftapp.json.js"], {cwd: RAIZ, env: {PATH: process.env.PATH, ...env}, encoding: "utf8", maxBuffer: 1e8});

test("loader sin credenciales escribe un JSON sintético con meta.fuente", () => {
  const r = correrLoader({});
  assert.equal(r.status, 0);
  const d = JSON.parse(r.stdout);
  assert.equal(d.meta.fuente, "sintetico");
  assert.ok(d.partidas.length > 100);
});

test("loader con REQUIRE_REAL_DATA=1 y sin credenciales sale con error y NO escribe datos", () => {
  const r = correrLoader({REQUIRE_REAL_DATA: "1"});
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /REQUIRE_REAL_DATA=1/);
});

test("loader con credenciales que no conectan falla sin filtrar los secretos", () => {
  const r = correrLoader({...CRED, ANALYTICS_DB_HOST: "127.0.0.1", ANALYTICS_DB_PORT: "1"});
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, "");
  for (const s of [CRED.ANALYTICS_DB_USER, CRED.ANALYTICS_DB_PASSWORD, "127.0.0.1"]) assert.ok(!r.stderr.includes(s), "stderr filtra un secreto");
});
