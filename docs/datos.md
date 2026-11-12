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

Los ids de jugador son puestos 1…n **de cada publicación**: pueden cambiar entre refrescos (se re-aleatorizan en cada actualización). Nada del sitio debe guardarlos ni usarlos para seguir a una
persona entre versiones. Las letras de los cubos, en cambio, son estables entre refrescos: solo si un cubo publicado deja de publicarse su letra desaparece y las siguientes pueden correrse (los cubos nuevos se agregan al final).

## Conexión segura: el certificado SSL se verifica

La conexión usa SSL **verificado**: el loader valida la cadena del servidor contra el **certificado raíz de Supabase** guardado en el repo
(`certs/prod-ca-2021.crt`) y comprueba que el nombre del host coincida con el certificado (`rejectUnauthorized: true`, comprobación de nombre por defecto).
No hay ninguna variable de entorno, opción ni ruta de escape para volver a conectar sin verificar, y una prueba automática lo vigila.

- **Qué es el archivo.** Es el certificado raíz **público** de Supabase (no es un secreto; no hay claves privadas en el repo). Sale del panel de Supabase:
  **Database Settings → SSL Configuration → Download certificate**. Una prueba confirma que `certs/` solo tiene un bloque `BEGIN CERTIFICATE` y ninguna clave privada.
- **Si el archivo falta, no se puede leer o no es un certificado, el loader FALLA**: nunca cae a una conexión sin verificar.
- Los errores de TLS se reducen a su código (por ejemplo `SELF_SIGNED_CERT_IN_CHAIN`, `CERT_HAS_EXPIRED` o `ERR_TLS_CERT_ALTNAME_INVALID`), sin host ni usuario.
- `probar-conexion.yml` hace checkout del repo y usa `PGSSLMODE=verify-full` con `PGSSLROOTCERT` apuntando a ese mismo archivo, de modo que la verificación se prueba de punta a punta desde GitHub.
- El certificado actual vence en abril de 2031.

### Si Supabase rota el certificado
- **Síntoma:** el build falla (el loader o `probar-conexion.yml`) con un error de certificado: `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED` o `ERR_TLS_CERT_ALTNAME_INVALID`. Como el build es falla-segura, queda publicada la versión anterior.
- **Solución:** descargar el certificado nuevo desde **Database Settings → SSL Configuration**, reemplazar `certs/prod-ca-2021.crt` (o agregar el nuevo y ajustar la ruta en `src/data/extraccion.js`),
  correr `npm test` y mergear. Después volver a correr `probar-conexion.yml` para confirmar la verificación de punta a punta.

## Qué no hace
No usa `service_role`, no escribe en la base, no guarda datos en el repo (el JSON se genera en cada build y solo se publica como parte del sitio) y no expone credenciales en logs ni en `dist`.
