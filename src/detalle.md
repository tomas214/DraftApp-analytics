---
title: Detalle
---

# Detalle

<p class="subtitulo">Tabla por jugador y listado de partidas, con búsqueda, orden por columna y descarga en CSV. Respeta los filtros.</p>

```js
import * as Inputs from "npm:@observablehq/inputs";
import {prepararDatos, filtrar, filtrarPartidas, porJugador} from "./components/datos.js";
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
// La tabla usa UNA fila por partida: entra si participa algún jugador seleccionado.
const partidas = filtrarPartidas(datos, filtros);
const columnas = {
  fecha: "Fecha", evento: "Evento", ronda: "Ronda", partida: "Partida",
  jugador_a: "Jugador A", color_a: "Color A", jugador_b: "Jugador B", color_b: "Color B",
  ganador: "Ganador", duracion_min: "Duración (min)"
};
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
  rows: 13,
  layout: "auto"
}));
```

</div>

<div class="card">

## Partidas

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
  format: {fecha: fechaCorta},
  rows: 15,
  layout: "auto"
}));
```

</div>
