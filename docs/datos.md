# Datos del sitio

El sitio publica estadísticas **agregadas y seudonimizadas** de DraftApp. Este documento explica de dónde salen los datos, cómo se publican y qué
garantías (y límites) tiene el proceso. El contrato de datos vive en el repo de la app (`docs-analytics/contrato.md`).

## Arquitectura

```
base de datos ──► rol de solo lectura ──► loader ──► build ──► verificación de dist ──► GitHub Pages
(refresco 08:30 UTC)  (analytics_reader)   (src/data)  (Framework)  (scripts/verificar-dist.mjs)  (artefacto)
```

1. **Base.** Una función de la base rellena a diario las tablas `analytics.*` ya filtradas y seudonimizadas (exclusión voluntaria, solo eventos oficiales, sin
   walkovers, etc.) y los controles `analytics_control.*` (`refresco`, `verificacion`, `registro_limpieza`).
2. **Rol de solo lectura.** `analytics_reader` solo hace `SELECT` sobre esos dos esquemas (límite de 2 conexiones, `statement_timeout` de 60 s). No ve el esquema privado.
3. **Loader** (`src/data/draftapp.json.js`). Con credenciales extrae de la base real (`src/data/extraccion.js`); sin ellas usa el generador sintético
   (`src/data/sintetico.js`). Escribe **un solo JSON** con las tablas y un `meta` (`fuente`, `refrescado_en`, `extraido_en`, `registro_limpieza`).
4. **Build.** Observable Framework genera el sitio estático en `dist/`.
5. **Verificación de `dist`.** `scripts/verificar-dist.mjs` falla si encuentra la contraseña, el host o el usuario de la base, un UUID o algo con forma de correo.
   Imprime solo el **tipo** de hallazgo, nunca lo encontrado.
6. **Publicación.** El artefacto se sube a GitHub Pages (job `deploy`).

El sitio muestra la fecha de actualización y las notas sobre los datos en la página *Acerca de los datos*. Con datos sintéticos muestra además un aviso
visible de que son datos de prueba (`meta.fuente = "sintetico"`).

## Qué lo hace falla-segura

Si algo no está en orden, **el build falla, no hay deploy y queda publicada la versión anterior**. El loader no publica si:

- faltan columnas que el sitio espera (se valida con `information_schema` **antes** de leer ningún dato);
- `analytics_control.refresco.vigente` no es `true`;
- el último refresco tiene más de **36 horas** (la base se refresca a diario; 36 h = 1 día + 12 h de margen);
- algún chequeo de `analytics_control.verificacion` tiene `ok` distinto de `true`, o la tabla está vacía;
- alguna de las seis tablas está vacía;
- los ids de jugador o de cubo tienen huecos o duplicados (deben ser 1…n consecutivos), o hay ids duplicados en eventos, enfrentamientos o partidas;
- participaciones, enfrentamientos o partidas apuntan a ids que no existen.

Además:

- **Con credenciales presentes, nunca se cae a datos sintéticos**: si la extracción falla, falla el build.
- En el workflow de publicación `REQUIRE_REAL_DATA=1`: si faltan las credenciales, el build falla en lugar de publicar datos de prueba.
- La extracción usa **una sola conexión y una sola transacción** `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` (todas las tablas ven el mismo instante).
- Los mensajes de error **nunca** incluyen host, usuario ni contraseña (los errores de conexión se reducen a su código).
- Los workflows no se ejecutan en paralelo (`concurrency`): el rol permite como máximo 2 conexiones.

## Workflows

### `deploy.yml` — publicación
Se dispara con **push a `main`**, a mano (`workflow_dispatch`) y todos los días a las **09:00 UTC** (la base se refresca a las 08:30 UTC).

| Job | Environment | Permisos | Qué hace |
|---|---|---|---|
| `build` | `datos` | `contents: read` | `npm ci`, pruebas del loader (`npm test`), build con `REQUIRE_REAL_DATA=1` y credenciales **solo en ese paso**, verificación de `dist` y subida del artefacto |
| `deploy` | `github-pages` | `pages: write`, `id-token: write` | publica el artefacto en Pages |

### `probar-conexion.yml` — prueba manual de la conexión
Solo `workflow_dispatch`. Comprueba, sin publicar nada, que la conexión funciona y es de solo lectura, que los controles dan `true` y que el rol **no** puede
leer el esquema privado ni escribir.

## Environment `datos`

Restringido a la rama `main`. Define:

| Tipo | Nombre | Para qué |
|---|---|---|
| Secreto | `ANALYTICS_READER_PASSWORD` | contraseña del rol de lectura |
| Variable | `ANALYTICS_DB_HOST` | servidor de la base (no se documenta aquí) |
| Variable | `ANALYTICS_DB_USER` | nombre del rol de lectura |

El loader las recibe como `ANALYTICS_DB_HOST`, `ANALYTICS_DB_USER` y `ANALYTICS_DB_PASSWORD` (el workflow mapea el secreto). Opcionales: `ANALYTICS_DB_PORT` (5432) y
`ANALYTICS_DB_NAME` (`postgres`).

## Desarrollo local

```bash
npm run dev      # sin credenciales: datos sintéticos (con aviso visible)
npm test         # pruebas del loader con un cliente falso (sin base real) y del verificador de dist
npm run check    # npm test + build local
```

El caché del loader (`src/.observablehq/cache`) **no** se invalida al cambiar variables de entorno: al alternar entre sintético y real, correr `npm run clean`.
Para probar la extracción real en local hay que exportar las tres variables `ANALYTICS_DB_*` (nunca en archivos del repo).

## Los jugadores cambian de número

Los ids de jugador y de cubo son puestos 1…n **de cada publicación**: pueden cambiar entre refrescos. Nada del sitio debe guardarlos ni usarlos para seguir a una
persona entre versiones.

## Pendiente: verificar el certificado SSL

La conexión usa SSL, pero **hoy no verifica el certificado del servidor** (`rejectUnauthorized: false`): el session pooler de Supabase usa un certificado cuya
autoridad no está en el almacén público de certificados del runner. El tráfico va cifrado, pero no queda protegido contra un intermediario que suplante al servidor.

Para cerrarlo: descargar el **certificado raíz de Supabase** (es público), guardarlo en el repo (por ejemplo `certs/supabase-root.crt`), pasarlo al cliente como
`ssl: { ca: <contenido>, rejectUnauthorized: true }` y volver a correr `probar-conexion.yml`. Queda como **tarea pendiente**.

## Qué no hace
No usa `service_role`, no escribe en la base, no guarda datos en el repo (el JSON se genera en cada build y solo se publica como parte del sitio) y no expone credenciales en logs ni en `dist`.
