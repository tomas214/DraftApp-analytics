# Conexión a los datos

El sitio hoy usa datos sintéticos. Cuando pase a datos reales, un workflow de GitHub Actions leerá datos **ya curados y anonimizados**
desde la base de datos con un rol de **solo lectura**. Este documento explica el workflow de prueba de esa conexión.

## Workflow `Probar conexión a los datos`

Archivo: `.github/workflows/probar-conexion.yml`. Se dispara **solo a mano** (Actions → *Probar conexión a los datos* → *Run workflow*)
y **solo desde `main`**. No publica nada ni toca el sitio. Sirve para comprobar, antes de cablear la extracción real, que:

1. La conexión funciona y la sesión es de **solo lectura**.
2. Las vistas curadas (`analytics.*`) devuelven datos y los controles internos (`analytics_control.*`) dan todos `true`.
3. El rol **no** puede leer el esquema privado ni escribir.

Pasos (cada uno usa una conexión corta; el rol permite como máximo 2 a la vez, por eso hay un `concurrency` que evita corridas simultáneas):

| Paso | Qué hace | Falla si… |
|---|---|---|
| Verificar psql | Comprueba que `psql` esté en el runner (lo instala si no). | no se puede instalar |
| 1. Lectura | En una transacción de solo lectura: muestra usuario y modo, cuenta las seis tablas curadas, muestra `analytics_control.refresco` y `analytics_control.verificacion`. | falla cualquier consulta, la transacción no es de solo lectura o algún chequeo de `verificacion` tiene `ok` distinto de `true` |
| 2. Negativa de lectura | Intenta `select count(*) from analytics_private.config`. | **no** falla con *permission denied* (el rol tendría más acceso del debido) |
| 3. Negativa de escritura | Intenta un `insert` en `analytics.cubos` (dentro de una transacción que se deshace). | **no** falla con un error del servidor (el rol tendría permisos de escritura) |

El log muestra solo conteos y nombres de chequeos. Los pasos 2 y 3 no imprimen la salida del cliente para no exponer detalles de conexión.

## Environment `datos`

El job usa el **Environment** de GitHub llamado `datos` (Settings → Environments), restringido a la rama `main`. Define:

| Tipo | Nombre | Para qué |
|---|---|---|
| Secreto | `ANALYTICS_READER_PASSWORD` | contraseña del rol de solo lectura. Solo se expone como `PGPASSWORD` en los pasos que se conectan; nunca se imprime ni se pasa por argumentos. |
| Variable | `ANALYTICS_DB_HOST` | servidor de la base (no es secreto, pero tampoco se documenta aquí) |
| Variable | `ANALYTICS_DB_USER` | nombre del rol de lectura |

Valores fijos en el workflow: puerto `5432`, base `postgres`, `sslmode=require`, timeout de conexión 15 s.

## Cuándo correrlo
Después de rotar la contraseña, de cambiar permisos del rol o de aplicar migraciones sobre `analytics*`. Si el paso 2 o el 3 fallan, **no** se debe cablear la extracción hasta corregir los permisos.

## Qué NO hace
No extrae ni publica datos, no usa `service_role`, no escribe en la base y no se ejecuta en cada push.
