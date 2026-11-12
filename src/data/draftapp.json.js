// Data loader de Observable Framework: escribe UN JSON a stdout que el sitio lee con FileAttachment("data/draftapp.json").
//
//   Con ANALYTICS_DB_HOST + ANALYTICS_DB_USER + ANALYTICS_DB_PASSWORD  -> datos REALES (src/data/extraccion.js)
//   Sin ellas                                                          -> datos SINTÉTICOS (src/data/sintetico.js), salvo REQUIRE_REAL_DATA=1
//
// Esquema y reglas: ver la cabecera de src/data/sintetico.js (es el mismo que publica la base real).
// Los mensajes van a stderr y nunca incluyen host, usuario ni contraseña. Cualquier problema termina con código de salida ≠ 0.
//
// OJO (local): Framework guarda la salida en caché (src/.observablehq/cache) y NO la invalida al cambiar variables de entorno.
// Al alternar entre sintético y real: `npm run clean`.
import {obtenerDatos} from "./fuente.js";

try {
  const datos = await obtenerDatos(process.env);
  process.stdout.write(JSON.stringify(datos));
} catch (e) {
  console.error(`ERROR en el loader de datos: ${e?.message ?? "error desconocido"}`);
  process.exitCode = 1;
}
