// Elige la fuente de datos: base real (si hay credenciales) o generador sintético.
import {generarSintetico} from "./sintetico.js";
import {extraer, conectar, credencialesDe, sanitizar, ErrorDatos} from "./extraccion.js";

/**
 * @param env        variables de entorno
 * @param opciones   {conectarFn, ahora} inyectables (pruebas)
 *
 *  - Con ANALYTICS_DB_HOST, ANALYTICS_DB_USER y ANALYTICS_DB_PASSWORD: extrae de la base real. Si algo falla, FALLA (nunca cae al sintético).
 *  - Sin credenciales: sintético (meta.fuente = "sintetico"), salvo REQUIRE_REAL_DATA=1, que falla.
 */
export async function obtenerDatos(env = process.env, {conectarFn = conectar, ahora = new Date()} = {}) {
  const exigirReal = env.REQUIRE_REAL_DATA === "1";
  const {credenciales, faltan} = credencialesDe(env);
  if (!credenciales) {
    if (exigirReal) {
      throw new ErrorDatos(`REQUIRE_REAL_DATA=1 pero faltan variables de entorno de la base (${faltan.join(", ")}). No se usan datos sintéticos.`);
    }
    if (faltan.length < 3) {
      console.error(`Aviso: credenciales incompletas (faltan ${faltan.join(", ")}); se usan datos SINTÉTICOS.`);
    }
    return generarSintetico();
  }
  const secretos = [credenciales.host, credenciales.user, credenciales.password];
  let cliente;
  try {
    cliente = await conectarFn(credenciales);
    const datos = await extraer(cliente, {ahora});
    console.error(
      `Extracción real OK: ${datos.jugadores.length} jugadores, ${datos.eventos.length} eventos, ${datos.partidas.length} partidas.`
    );
    return datos;
  } catch (e) {
    // Mensaje final siempre saneado (defensa extra: no debe contener credenciales).
    throw new ErrorDatos(sanitizar(e?.message, secretos));
  } finally {
    await cliente?.end?.();
  }
}
