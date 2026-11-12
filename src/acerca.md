---
title: Acerca de los datos
---

# Acerca de los datos

```js
import {prepararDatos} from "./components/datos.js";
import {avisoDatos} from "./components/aviso.js";
import {num} from "./components/tema.js";
import {html} from "npm:htl";

const raw = await FileAttachment("data/draftapp.json").json();
const datos = prepararDatos(raw);
const meta = raw.meta;
const hora = (iso) =>
  new Date(iso).toLocaleString("es-AR", {timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "short"}) + " (hora de Buenos Aires)";
const registro = meta?.registro_limpieza ?? [];
// "Quién empieza": se usa el conteo del registro tal cual (ya viene con "<5" si son pocas); si no existe, se calcula con la misma regla.
const sinEmpieza =
  registro.find((r) => r.concepto === "partidas_sin_dato_de_quien_empieza")?.cantidad ??
  (() => {
    const n = datos.partidas.filter((p) => p.empieza === null).length;
    return n < 5 ? "<5" : num(n);
  })();
```

```js
display(avisoDatos(meta));
```

<div class="card texto">

## Actualización

Última actualización de los datos: **${meta?.refrescado_en ? hora(meta.refrescado_en) : "sin dato"}**.

## Privacidad

- Los datos están **seudonimizados, no anonimizados**. Cada jugador aparece como «Jugador n», pero en un grupo chico quien participó puede reconocer a otras personas por las fechas, los colores y los resultados.
- La **autoevaluación del mazo es el dato más sensible** que se publica: es un juicio personal de cada jugador sobre sí mismo, ligado a un evento.
- Los **números de jugador pueden cambiar entre actualizaciones** (y también las letras de los cubos): no sirven para seguir a una persona de una versión a otra.

## Qué se excluye

- Los **walkovers** (cuando alguien se va del evento y sus cruces pendientes se resuelven solos) y las **series con walkover**: ni el cruce ni sus partidas se publican.
- También quedan fuera los eventos de Gigante de dos cabezas, las venganzas y los eventos de prueba.
- Las partidas con mazo prestado y las del exilio no cuentan en las estadísticas por colores.
- En el análisis de **jugando primero / robando primero** quedan fuera las partidas sin dato de quién jugó primero: **${sinEmpieza}** partidas.

## Registro de limpieza

Cuánto se descartó o se dejó sin valor al preparar los datos. Las cantidades menores a 5 se muestran como «<5».

${registro.length
  ? html`<table class="tabla-registro"><thead><tr><th>Concepto</th><th>Cantidad</th></tr></thead><tbody>${registro.map((r) => html`<tr><td><code>${r.concepto}</code></td><td>${r.cantidad}</td></tr>`)}</tbody></table>`
  : html`<p>Sin registro.</p>`}

</div>
