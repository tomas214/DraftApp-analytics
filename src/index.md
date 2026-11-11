---
title: Resumen
---

# Resumen

<p class="subtitulo">Los filtros de abajo actualizan todos los indicadores y gráficos de esta página. Datos sintéticos de ejemplo.</p>

```js
import * as Plot from "npm:@observablehq/plot";
import {prepararDatos, filtrar, resumen, porJugador, porEvento, porJugadorColor} from "./components/datos.js";
import {crearFiltros} from "./components/filtros.js";
import {kpis} from "./components/kpi.js";
import {ACENTO, escalaColores, pct, num, fechaCorta} from "./components/tema.js";

const datos = prepararDatos(await FileAttachment("data/draftapp.json").json());
```

```js
const filtros = view(crearFiltros(datos));
```

```js
const filas = filtrar(datos.filas, filtros);
const r = resumen(filas);
const jugadores = porJugador(filas);
const eventos = porEvento(filas);
const jugadorColor = porJugadorColor(filas);
```

```js
display(kpis([
  {titulo: "Partidas jugadas", valor: num(r.partidas), nota: `${num(r.eventos)} eventos`},
  {titulo: "Victorias", valor: num(r.ganadas), nota: "de los jugadores filtrados"},
  {titulo: "Winrate", valor: pct(r.winrate), nota: "con todos los jugadores es 50 % por construcción"},
  {titulo: "Duración media", valor: `${num(r.duracion, 1)} min`, nota: "por partida"},
  {titulo: "Jugadores activos", valor: num(r.jugadores), nota: `de ${datos.jugadores.length}`}
]));
```

```js
display(filas.length === 0 ? html`<div class="card vacio">Sin datos para los filtros elegidos.</div>` : html`<div class="grid-bi">
  <div class="card">
    <h2>Victorias por jugador</h2>
    <h3>Barras · placeholder</h3>
    ${resize((width) => Plot.plot({
      width, marginLeft: 80,
      x: {label: "Victorias", grid: true},
      y: {label: null},
      marks: [
        Plot.barX(jugadores, {y: "jugador", x: "ganadas", sort: {y: "-x"}, fill: ACENTO, tip: true,
          title: (d) => `${d.jugador}\nVictorias: ${d.ganadas} de ${d.jugadas}\nWinrate: ${pct(d.winrate)}`}),
        Plot.ruleX([0])
      ]
    }))}
  </div>
  <div class="card">
    <h2>Duración media por evento</h2>
    <h3>Línea en el tiempo · placeholder</h3>
    ${resize((width) => Plot.plot({
      width,
      x: {label: null, type: "utc"},
      y: {label: "Minutos", grid: true, nice: true},
      marks: [
        Plot.lineY(eventos, {x: "fecha", y: "duracion", stroke: ACENTO, strokeWidth: 2, curve: "monotone-x"}),
        Plot.dot(eventos, {x: "fecha", y: "duracion", fill: ACENTO, r: 4, tip: true,
          title: (d) => `${d.evento} · ${fechaCorta(d.fecha)}\nDuración media: ${num(d.duracion, 1)} min\nPartidas (jugador): ${d.jugadas}`})
      ]
    }))}
  </div>
  <div class="card">
    <h2>Winrate por jugador y color</h2>
    <h3>Mapa de calor · placeholder</h3>
    ${resize((width) => Plot.plot({
      width, marginLeft: 80, padding: 0.05,
      x: {label: null, domain: escalaColores.domain},
      y: {label: null, domain: datos.jugadores},
      color: {type: "diverging", pivot: 0.5, scheme: "RdBu", domain: [0, 1], label: "Winrate", legend: true, tickFormat: "%"},
      marks: [
        Plot.cell(jugadorColor, {x: "color", y: "jugador", fill: "winrate", tip: true,
          title: (d) => `${d.jugador} con ${d.color}\nWinrate: ${pct(d.winrate)} (${d.ganadas}/${d.jugadas})`})
      ]
    }))}
  </div>
  <div class="card">
    <h2>Volumen vs. winrate</h2>
    <h3>Dispersión · placeholder</h3>
    ${resize((width) => Plot.plot({
      width,
      x: {label: "Partidas jugadas", grid: true},
      y: {label: "Winrate", grid: true, tickFormat: "%", domain: [0, 1]},
      r: {range: [3, 8]},
      marks: [
        Plot.ruleY([0.5], {stroke: "currentColor", strokeOpacity: 0.3, strokeDasharray: "4,3"}),
        Plot.dot(jugadores, {x: "jugadas", y: "winrate", r: "duracion", fill: ACENTO, fillOpacity: 0.75, tip: true,
          title: (d) => `${d.jugador}\nPartidas: ${d.jugadas}\nWinrate: ${pct(d.winrate)}\nDuración media: ${num(d.duracion, 1)} min`})
      ]
    }))}
  </div>
</div>`);
```
