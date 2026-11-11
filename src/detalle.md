---
title: Detalle
---

# Detalle

<p class="subtitulo">Tabla por jugador y listado de partidas, con búsqueda, orden por columna y descarga en CSV. Respeta los filtros.</p>

```js
import * as Inputs from "npm:@observablehq/inputs";
import {prepararDatos, filtrar, porJugador} from "./components/datos.js";
import {crearFiltros} from "./components/filtros.js";
import {botonCSV} from "./components/csv.js";
import {pct, num, fechaCorta} from "./components/tema.js";

const datos = prepararDatos(await FileAttachment("data/draftapp.json").json());
```

```js
const filtros = view(crearFiltros(datos));
```

```js
const filas = filtrar(datos.filas, filtros);
const resumenJugadores = porJugador(filas);
```

<div class="card">

## Por jugador

```js
display(Inputs.table(resumenJugadores, {
  columns: ["jugador", "jugadas", "ganadas", "winrate", "duracion"],
  header: {jugador: "Jugador", jugadas: "Jugadas", ganadas: "Ganadas", winrate: "Winrate", duracion: "Duración media (min)"},
  format: {winrate: pct, duracion: (x) => num(x, 1)},
  sort: "winrate",
  reverse: true,
  rows: 13
}));
```

</div>

<div class="card">

## Partidas

```js
const buscadas = view(Inputs.search(filas, {placeholder: "Buscar por jugador, rival, evento, color…"}));
```

```js
display(botonCSV(buscadas, "partidas.csv"));
```

```js
display(Inputs.table(buscadas, {
  columns: ["fecha", "evento", "ronda", "partida", "jugador", "rival", "color", "color_rival", "resultado", "duracion_min"],
  header: {fecha: "Fecha", evento: "Evento", ronda: "Ronda", partida: "Partida", jugador: "Jugador", rival: "Rival",
    color: "Color", color_rival: "Color rival", resultado: "Resultado", duracion_min: "Min"},
  format: {fecha: fechaCorta},
  rows: 15
}));
```

</div>
