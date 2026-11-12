// Extracción de los datos REALES (curados y anonimizados dentro de la base) con el rol de solo lectura.
//
// Reglas de diseño:
//  * UNA conexión y UNA transacción BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY (todas las tablas ven el mismo instante).
//  * FALLA-SEGURA: ante cualquier problema se lanza un error y NO se publica nada (el build falla y queda la versión anterior).
//  * Nunca se escribe en el log (ni en los mensajes de error) el host, el usuario ni la contraseña.
//  * El cliente se inyecta (`cliente.query(sql)`), así las pruebas usan un cliente falso sin base real.
import fs from "node:fs";
import pg from "pg";

// Certificado raíz PÚBLICO de Supabase (Database Settings → SSL Configuration). Ruta fija dentro del repo: NO hay variable de entorno
// ni opción para cambiarla ni para desactivar la verificación.
const RUTA_CA = new URL("../../certs/prod-ca-2021.crt", import.meta.url);

/** Un refresco más viejo que esto se considera vencido (la base se refresca a diario; 36 h = 1 día + margen). */
export const MAX_ANTIGUEDAD_HORAS = 36;

/** Error de validación de datos: su mensaje es seguro de mostrar (no contiene credenciales ni datos de personas). */
export class ErrorDatos extends Error {}

// Columnas que el sitio espera (contrato: docs-analytics/contrato.md del repo DraftApp).
export const COLUMNAS_ESPERADAS = {
  "analytics.jugadores": ["id", "nombre"],
  "analytics.cubos": ["id", "nombre"],
  "analytics.eventos": ["id", "nombre", "fecha", "event_type", "es_oficial", "estado", "competition_format", "match_format", "cubo_id", "duracion_draft_min"],
  "analytics.participaciones": ["evento_id", "jugador_id", "rol", "colores", "autoevaluacion"],
  "analytics.enfrentamientos": ["id", "evento_id", "ronda", "fase", "etapa", "jugador_a", "jugador_b", "ganador_id", "resultado", "con_mazo_prestado"],
  "analytics.partidas": ["id", "enfrentamiento_id", "numero", "tipo", "estado", "jugador_a", "jugador_b", "ganador_id", "empieza_id", "duracion_min", "mazo_prestado_a", "mazo_prestado_b"],
  "analytics_control.refresco": ["refrescado_en", "vigente"],
  "analytics_control.verificacion": ["chequeo", "ok"],
  "analytics_control.registro_limpieza": ["concepto", "cantidad"]
};

const ORDEN = {
  "analytics.jugadores": "id",
  "analytics.cubos": "id",
  "analytics.eventos": "id",
  "analytics.participaciones": "evento_id, jugador_id",
  "analytics.enfrentamientos": "id",
  "analytics.partidas": "id",
  "analytics_control.verificacion": "chequeo",
  "analytics_control.registro_limpieza": "concepto"
};

const sqlDe = (tabla) =>
  `select ${COLUMNAS_ESPERADAS[tabla].join(", ")} from ${tabla}` + (ORDEN[tabla] ? ` order by ${ORDEN[tabla]}` : "");

// ---- conversión de tipos --------------------------------------------------------------------------------------------------

const aEntero = (v, donde) => {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v;
  if (!Number.isSafeInteger(n)) throw new ErrorDatos(`valor no entero o fuera del rango seguro en ${donde}`);
  return n;
};
const aEnteroONulo = (v, donde) => (v === null || v === undefined ? null : aEntero(v, donde));
const aTexto = (v, donde) => {
  if (typeof v !== "string") throw new ErrorDatos(`se esperaba texto en ${donde}`);
  return v;
};
const aTextoONulo = (v, donde) => (v === null || v === undefined ? null : aTexto(v, donde));
const aBooleano = (v, donde) => {
  if (typeof v !== "boolean") throw new ErrorDatos(`se esperaba booleano en ${donde}`);
  return v;
};
// `date` llega como "YYYY-MM-DD" (el cliente real lo devuelve como texto); un Date se toma en UTC.
const aFecha = (v, donde) => {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  throw new ErrorDatos(`fecha inválida en ${donde}`);
};

// ---- extracción -----------------------------------------------------------------------------------------------------------

/**
 * Lee y valida todo en una transacción de solo lectura. Devuelve el objeto que escribe el loader (con meta.fuente = "real").
 * @param cliente  objeto con `query(sql)` que devuelve `{rows}`
 * @param ahora    reloj inyectable (pruebas)
 */
export async function extraer(cliente, {ahora = new Date()} = {}) {
  await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const datos = await leerYValidar(cliente, ahora);
    await cliente.query("COMMIT");
    return datos;
  } catch (e) {
    try {
      await cliente.query("ROLLBACK");
    } catch {
      /* la conexión se cierra igual */
    }
    throw e;
  }
}

async function leerYValidar(cliente, ahora) {
  // 1. Las columnas esperadas existen (antes de leer ningún dato)
  const cols = await cliente.query(
    "select table_schema, table_name, column_name from information_schema.columns where table_schema in ('analytics', 'analytics_control')"
  );
  const presentes = new Set(cols.rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`));
  const faltan = [];
  for (const [tabla, columnas] of Object.entries(COLUMNAS_ESPERADAS)) {
    for (const c of columnas) if (!presentes.has(`${tabla}.${c}`)) faltan.push(`${tabla}.${c}`);
  }
  if (faltan.length) {
    throw new ErrorDatos(`la base no tiene las columnas esperadas por el sitio (falta: ${faltan.join(", ")}). No se publican datos.`);
  }

  // 2. Estado del refresco y verificación (antes de leer las tablas grandes)
  const ref = (await cliente.query("select refrescado_en, vigente from analytics_control.refresco")).rows;
  if (ref.length !== 1) throw new ErrorDatos(`analytics_control.refresco debe tener exactamente 1 fila (tiene ${ref.length}).`);
  const refrescado = ref[0].refrescado_en instanceof Date ? ref[0].refrescado_en : new Date(ref[0].refrescado_en);
  if (ref[0].vigente !== true) {
    throw new ErrorDatos("los datos de la base NO están vigentes (refresco.vigente no es true): hay que volver a correr el refresco en la base.");
  }
  if (!ref[0].refrescado_en || isNaN(refrescado)) throw new ErrorDatos("refresco.refrescado_en vacío o inválido.");
  const horas = (ahora - refrescado) / 3600000;
  if (horas < -0.1) throw new ErrorDatos("refresco.refrescado_en está en el futuro.");
  if (horas > MAX_ANTIGUEDAD_HORAS) {
    throw new ErrorDatos(`el último refresco de la base tiene ${Math.round(horas)} horas de antigüedad (máximo ${MAX_ANTIGUEDAD_HORAS}): datos vencidos.`);
  }
  const verif = (await cliente.query(sqlDe("analytics_control.verificacion"))).rows;
  if (!verif.length) throw new ErrorDatos("analytics_control.verificacion está vacía: no hay evidencia de que los controles hayan corrido.");
  const malos = verif.filter((r) => r.ok !== true).map((r) => String(r.chequeo));
  if (malos.length) throw new ErrorDatos(`chequeos de verificación con ok distinto de true: ${malos.join(", ")}.`);

  // 3. Tablas del contrato, convertidas a los tipos que esperan los componentes
  const filas = async (tabla) => (await cliente.query(sqlDe(tabla))).rows;
  const jugadores = (await filas("analytics.jugadores")).map((r) => ({id: aEntero(r.id, "jugadores.id"), nombre: aTexto(r.nombre, "jugadores.nombre")}));
  const cubos = (await filas("analytics.cubos")).map((r) => ({id: aEntero(r.id, "cubos.id"), nombre: aTexto(r.nombre, "cubos.nombre")}));
  const eventos = (await filas("analytics.eventos")).map((r) => ({
    id: aEntero(r.id, "eventos.id"),
    nombre: aTexto(r.nombre, "eventos.nombre"),
    fecha: aFecha(r.fecha, "eventos.fecha"),
    event_type: aTexto(r.event_type, "eventos.event_type"),
    es_oficial: aBooleano(r.es_oficial, "eventos.es_oficial"),
    estado: aTexto(r.estado, "eventos.estado"),
    competition_format: aTexto(r.competition_format, "eventos.competition_format"),
    match_format: aTexto(r.match_format, "eventos.match_format"),
    cubo_id: aEnteroONulo(r.cubo_id, "eventos.cubo_id"),
    duracion_draft_min: aEnteroONulo(r.duracion_draft_min, "eventos.duracion_draft_min")
  }));
  const participaciones = (await filas("analytics.participaciones")).map((r) => ({
    evento_id: aEntero(r.evento_id, "participaciones.evento_id"),
    jugador_id: aEntero(r.jugador_id, "participaciones.jugador_id"),
    rol: aTexto(r.rol, "participaciones.rol"),
    colores: aTextoONulo(r.colores, "participaciones.colores"),
    autoevaluacion: aEnteroONulo(r.autoevaluacion, "participaciones.autoevaluacion")
  }));
  const enfrentamientos = (await filas("analytics.enfrentamientos")).map((r) => ({
    id: aEntero(r.id, "enfrentamientos.id"),
    evento_id: aEntero(r.evento_id, "enfrentamientos.evento_id"),
    ronda: aEnteroONulo(r.ronda, "enfrentamientos.ronda"),
    fase: aTexto(r.fase, "enfrentamientos.fase"),
    etapa: aTextoONulo(r.etapa, "enfrentamientos.etapa"),
    jugador_a: aEntero(r.jugador_a, "enfrentamientos.jugador_a"),
    jugador_b: aEntero(r.jugador_b, "enfrentamientos.jugador_b"),
    ganador_id: aEnteroONulo(r.ganador_id, "enfrentamientos.ganador_id"),
    resultado: aTexto(r.resultado, "enfrentamientos.resultado"),
    con_mazo_prestado: aBooleano(r.con_mazo_prestado, "enfrentamientos.con_mazo_prestado")
  }));
  const partidas = (await filas("analytics.partidas")).map((r) => ({
    id: aEntero(r.id, "partidas.id"),
    enfrentamiento_id: aEntero(r.enfrentamiento_id, "partidas.enfrentamiento_id"),
    numero: aEntero(r.numero, "partidas.numero"),
    tipo: aTexto(r.tipo, "partidas.tipo"),
    estado: aTexto(r.estado, "partidas.estado"),
    jugador_a: aEntero(r.jugador_a, "partidas.jugador_a"),
    jugador_b: aEntero(r.jugador_b, "partidas.jugador_b"),
    ganador_id: aEntero(r.ganador_id, "partidas.ganador_id"),
    empieza_id: aEnteroONulo(r.empieza_id, "partidas.empieza_id"),
    duracion_min: aEnteroONulo(r.duracion_min, "partidas.duracion_min"),
    mazo_prestado_a: aBooleano(r.mazo_prestado_a, "partidas.mazo_prestado_a"),
    mazo_prestado_b: aBooleano(r.mazo_prestado_b, "partidas.mazo_prestado_b")
  }));
  const registro = (await filas("analytics_control.registro_limpieza")).map((r) => ({
    concepto: aTexto(r.concepto, "registro_limpieza.concepto"),
    cantidad: aTexto(r.cantidad, "registro_limpieza.cantidad") // tal cual viene ("<5" incluido)
  }));

  const datos = {jugadores, cubos, eventos, participaciones, enfrentamientos, partidas};
  validarDatos(datos);
  return {
    meta: {fuente: "real", refrescado_en: refrescado.toISOString(), extraido_en: ahora.toISOString(), registro_limpieza: registro},
    ...datos
  };
}

/** Validaciones de integridad. Los mensajes no incluyen valores de filas, solo nombres de tablas y columnas. */
export function validarDatos({jugadores, cubos, eventos, participaciones, enfrentamientos, partidas}) {
  for (const [nombre, tabla] of Object.entries({jugadores, cubos, eventos, participaciones, enfrentamientos, partidas})) {
    if (!tabla.length) throw new ErrorDatos(`la tabla ${nombre} está vacía.`);
  }
  const consecutivos = (nombre, tabla) => {
    const ids = tabla.map((r) => r.id).sort((a, b) => a - b);
    if (new Set(ids).size !== ids.length) throw new ErrorDatos(`ids duplicados en ${nombre}.`);
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== i + 1) throw new ErrorDatos(`los ids de ${nombre} no son consecutivos 1..n (hay huecos).`);
    }
  };
  consecutivos("jugadores", jugadores);
  consecutivos("cubos", cubos);
  const unicos = (nombre, ids) => {
    if (new Set(ids).size !== ids.length) throw new ErrorDatos(`ids duplicados en ${nombre}.`);
  };
  unicos("eventos", eventos.map((r) => r.id));
  unicos("enfrentamientos", enfrentamientos.map((r) => r.id));
  unicos("partidas", partidas.map((r) => r.id));
  unicos("participaciones (evento_id, jugador_id)", participaciones.map((r) => `${r.evento_id}:${r.jugador_id}`));

  const idsJug = new Set(jugadores.map((r) => r.id));
  const idsCub = new Set(cubos.map((r) => r.id));
  const idsEve = new Set(eventos.map((r) => r.id));
  const idsEnf = new Set(enfrentamientos.map((r) => r.id));
  const ref = (nombre, ok) => {
    if (!ok) throw new ErrorDatos(`referencias a ids inexistentes en ${nombre}.`);
  };
  ref("eventos.cubo_id", eventos.every((r) => r.cubo_id === null || idsCub.has(r.cubo_id)));
  ref("participaciones.evento_id", participaciones.every((r) => idsEve.has(r.evento_id)));
  ref("participaciones.jugador_id", participaciones.every((r) => idsJug.has(r.jugador_id)));
  ref("enfrentamientos.evento_id", enfrentamientos.every((r) => idsEve.has(r.evento_id)));
  ref("enfrentamientos.jugador_a/jugador_b", enfrentamientos.every((r) => idsJug.has(r.jugador_a) && idsJug.has(r.jugador_b)));
  ref("enfrentamientos.ganador_id", enfrentamientos.every((r) => r.ganador_id === null || idsJug.has(r.ganador_id)));
  ref("partidas.enfrentamiento_id", partidas.every((r) => idsEnf.has(r.enfrentamiento_id)));
  ref("partidas.jugador_a/jugador_b", partidas.every((r) => idsJug.has(r.jugador_a) && idsJug.has(r.jugador_b)));
  ref("partidas.ganador_id", partidas.every((r) => idsJug.has(r.ganador_id)));
  ref("partidas.empieza_id", partidas.every((r) => r.empieza_id === null || idsJug.has(r.empieza_id)));
}

// ---- conexión -------------------------------------------------------------------------------------------------------------

/** Quita de un texto cualquier aparición de los secretos (y de su versión codificada para URL). */
export function sanitizar(texto, secretos) {
  let t = String(texto ?? "");
  for (const s of secretos) {
    if (!s) continue;
    for (const variante of new Set([s, encodeURIComponent(s)])) t = t.split(variante).join("[oculto]");
  }
  return t;
}

/** Credenciales desde variables de entorno, o null si falta alguna (devuelve también los nombres de las que faltan). */
export function credencialesDe(env) {
  const host = env.ANALYTICS_DB_HOST;
  const user = env.ANALYTICS_DB_USER;
  const password = env.ANALYTICS_DB_PASSWORD;
  const faltan = ["ANALYTICS_DB_HOST", "ANALYTICS_DB_USER", "ANALYTICS_DB_PASSWORD"].filter((n) => !env[n]);
  if (faltan.length) return {credenciales: null, faltan};
  return {
    credenciales: {host, user, password, port: Number(env.ANALYTICS_DB_PORT || 5432), database: env.ANALYTICS_DB_NAME || "postgres"},
    faltan: []
  };
}

/**
 * Lee el certificado raíz del repo. Falla si no existe, no se puede leer, no es un certificado o contiene una clave privada.
 * Nunca hay un camino que continúe sin certificado.
 */
export function leerCertificado(ruta = RUTA_CA) {
  let texto;
  try {
    texto = fs.readFileSync(ruta, "utf8");
  } catch {
    throw new ErrorDatos("no se pudo leer el certificado raíz de Supabase (certs/prod-ca-2021.crt): no se conecta sin verificar el certificado.");
  }
  if (!texto.includes("-----BEGIN CERTIFICATE-----") || /PRIVATE KEY/.test(texto)) {
    throw new ErrorDatos("certs/prod-ca-2021.crt no es un certificado público válido: no se conecta sin verificar el certificado.");
  }
  return texto;
}

/**
 * Abre UNA conexión con SSL VERIFICADO: la cadena se valida contra el certificado raíz de Supabase del repo (certs/) y se verifica el
 * nombre del host (comportamiento por defecto de TLS; no se reemplaza checkServerIdentity). No existe ninguna vía para conectar sin verificar.
 * Los errores de conexión y de TLS se reducen a su código: el mensaje original puede incluir el host o el usuario.
 * @param opciones.leerCa  lector del certificado (inyectable en pruebas)
 */
export async function conectar(credenciales, ClienteDb = pg.Client, {leerCa = leerCertificado} = {}) {
  const secretos = [credenciales.host, credenciales.user, credenciales.password];
  const ca = leerCa(); // si falla, se lanza ANTES de crear el cliente
  const cliente = new ClienteDb({
    host: credenciales.host,
    user: credenciales.user,
    password: credenciales.password,
    port: credenciales.port,
    database: credenciales.database,
    ssl: {ca, rejectUnauthorized: true},
    connectionTimeoutMillis: 15000,
    query_timeout: 60000,
    application_name: "draftapp-analytics-build",
    // bigint (int8) como Number (los ids opacos caben en 48 bits) y `date` como texto "YYYY-MM-DD" (sin zona horaria)
    types: {
      getTypeParser: (oid, formato) => {
        if (oid === 20) return (v) => Number(v);
        if (oid === 1082) return (v) => v;
        return pg.types.getTypeParser(oid, formato);
      }
    }
  });
  cliente.on?.("error", () => {
    /* errores asíncronos de la conexión: se ignoran (no se loguean: podrían incluir el host) */
  });
  try {
    await cliente.connect();
  } catch (e) {
    const codigo = sanitizar(e?.code ?? "sin código", secretos);
    throw new ErrorDatos(`no se pudo conectar a la base de datos (${codigo}).`);
  }
  // Los errores de consulta se sanean antes de salir del cliente.
  const consultar = cliente.query.bind(cliente);
  return {
    query: async (sql) => {
      try {
        return await consultar(sql);
      } catch (e) {
        throw new ErrorDatos(`error de la base de datos (${sanitizar(e?.code ?? "sin código", secretos)}): ${sanitizar(e?.message, secretos).split("\n")[0].slice(0, 200)}`);
      }
    },
    end: () => cliente.end().catch(() => {})
  };
}
