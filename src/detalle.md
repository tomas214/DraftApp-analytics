---
title: Detalle
---

# Detalle

```js
import * as Inputs from "npm:@observablehq/inputs";
import {prepararDatos, filtrarFechas, porJugador} from "./components/datos.js";
import {crearFiltros} from "./components/filtros.js";
import {botonCSV} from "./components/csv.js";
import {avisoDatos} from "./components/aviso.js";
import {pct, num, fechaCorta} from "./components/tema.js";

const datos = prepararDatos(await FileAttachment("data/draftapp.json").json());
```

```js
display(avisoDatos(datos.meta));
```

```js
const filtros = view(crearFiltros(datos));
```

```js
const f = filtrarFechas(datos, filtros);
const resumenJugadores = porJugador(f.filasPartida);
// Una fila por partida oficial; la fecha es siempre la del evento.
const partidas = f.partidas;
const columnas = {
  fecha: "Fecha", evento: "Evento", fase: "Fase", numero: "Partida",
  jugador_a: "Jugador A", color_a: "Colores A", jugador_b: "Jugador B", color_b: "Colores B",
  ganador: "Ganador", empieza: "Jugando primero", duracion_min: "Duración (min)", cubo: "Cubo"
};
```

<div class="card">

```js
display(Inputs.table(resumenJugadores, {
  columns: ["jugador", "jugadas", "ganadas", "winrate", "duracion"],
  header: {jugador: "Jugador", jugadas: "Partidas", ganadas: "Ganadas", winrate: "Winrate", duracion: "Duración media (min)"},
  format: {winrate: pct, duracion: (x) => num(x, 1)},
  sort: "winrate",
  reverse: true,
  rows: 13,
  layout: "auto"
}));
```

</div>

<div class="card">

```js
const buscadas = view(Inputs.search(partidas, {placeholder: "Buscar por jugador, evento, color, ganador…"}));
```

```js
display(botonCSV(buscadas, columnas, "partidas.csv"));
```

```js
display(Inputs.table(buscadas, {
  columns: Object.keys(columnas),
  header: columnas,
  format: {fecha: fechaCorta, empieza: (x) => x ?? "—", color_a: (x) => x ?? "—", color_b: (x) => x ?? "—"},
  rows: 15,
  layout: "auto"
}));
```

</div>
