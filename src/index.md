---
title: Resumen
---

# Resumen

```js
import * as Inputs from "npm:@observablehq/inputs";
import {prepararDatos, filtrarFechas, resumen, kde, porCombinacion, serieEventos, boxplotsPorEvento, empezoPorJugador, resumenCategoria, valoracionVsWinrate, porCubo} from "./components/datos.js";
import {crearFiltros} from "./components/filtros.js";
import {kpis} from "./components/kpi.js";
import {avisoDatos} from "./components/aviso.js";
import {num} from "./components/tema.js";
import {MIN_PARTIDAS, JUGANDO_PRIMERO, ROBANDO_PRIMERO, graficoDensidad, graficoCombinaciones, graficoSerie, graficoSerieBoxplot, graficoEmpezo, graficoValoracion, graficoCubo} from "./components/graficos.js";

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
const r = resumen(f);
```

```js
display(kpis([
  {titulo: "Partidas jugadas", valor: num(r.partidas)},
  {titulo: "Eventos", valor: num(r.eventos)},
  {titulo: "Duración media", valor: `${num(r.duracion, 1)} min`}
]));
```

<div class="card ancho">

```js
const metricaSerie = view(Inputs.radio(new Map([["Inscriptos", "inscriptos"], ["Duración del draft", "draft"], ["Duración de partida", "partida"]]), {value: "inscriptos"}));
```

```js
display(resize((width) => metricaSerie === "partida" ? graficoSerieBoxplot(boxplotsPorEvento(f), width) : graficoSerie(serieEventos(f), metricaSerie, width)));
```

</div>

<div class="grid-bi">
<div class="card">

```js
display(resize((width) => graficoDensidad(kde(f.partidas.map((p) => p.duracion_min)), width)));
```

</div>
<div class="card">

```js
const colorear = view(Inputs.radio(["Un solo color", "Un color por jugador"], {value: "Un solo color"}));
```

```js
const puntosEmpezo = empezoPorJugador(f.filasPartida, MIN_PARTIDAS);
const resumenesEmpezo = [JUGANDO_PRIMERO, ROBANDO_PRIMERO].map((c) => resumenCategoria(puntosEmpezo, c)).filter(Boolean);
display(resize((width) => graficoEmpezo(puntosEmpezo, resumenesEmpezo, colorear === "Un color por jugador", datos.jugadores, width)));
```

</div>
</div>

<div class="card ancho">

```js
display(resize((width) => graficoValoracion(valoracionVsWinrate(f), width)));
```

</div>

<div class="card ancho">

```js
const modoCombos = view(Inputs.radio(new Map([["Winrate", "winrate"], ["Ocurrencias", "ocurrencias"]]), {value: "winrate"}));
```

```js
const combos = porCombinacion(f);
display(html`<div class="scroll-x">${resize((width) => graficoCombinaciones(combos, modoCombos, width))}</div>`);
```

</div>

<div class="card ancho">

```js
const cubo = porCubo(f);
display(html`<div class="paneles">
  <div>${resize((width) => graficoCubo(cubo.draft, "Duración del draft (min)", width))}</div>
  <div>${resize((width) => graficoCubo(cubo.partida, "Duración de las partidas (min)", width))}</div>
</div>`);
```

</div>
