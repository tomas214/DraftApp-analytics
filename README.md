# DraftApp Analytics

Sitio estático con [Observable Framework](https://observablehq.com/framework/) tipo tablero de BI (filtros globales, KPIs, gráficos, tabla de detalle). Por ahora usa **datos sintéticos de ejemplo**.

Publicado en: https://tomas214.github.io/DraftApp-analytics/

## Cómo correrlo

```bash
npm install
npm run dev      # servidor local con recarga en vivo (ver la URL que imprime)
```

## Cómo construirlo

```bash
npm run build    # genera el sitio estático en dist/
```

El workflow `.github/workflows/deploy.yml` construye y publica en GitHub Pages en cada push a `main`
(en Settings → Pages, elegir **Source: GitHub Actions**). El disparo programado (cron) está comentado en el mismo archivo.

## Estructura

- `src/index.md` (Resumen) y `src/detalle.md` (Detalle): páginas; cada una aparece en la navegación lateral.
- `src/components/`: filtros, KPIs, transformaciones, paleta y descarga CSV reutilizables.
- `src/data/draftapp.json.js`: data loader sintético (semilla fija, siempre el mismo resultado).
- `src/style.css` y `observablehq.config.js`: estilo y configuración (`base` apunta a `/DraftApp-analytics/`).

## Cómo se reemplaza el dato sintético por el real

Las páginas solo leen `data/draftapp.json`, con este esquema (documentado arriba en el loader):
`jugadores`, `eventos`, `enfrentamientos`, `partidas`.

1. Reemplazar `src/data/draftapp.json.js` por un loader que consulte la base y escriba ese mismo JSON a stdout
   (o un `draftapp.json.py`, o un Parquet con `FileAttachment(...).parquet()`).
2. Guardar las credenciales como *secrets* del repo y pasarlas como `env` en el paso de build del workflow.
3. Los jugadores se anonimizan en el loader (por ejemplo `Jugador N`); no deben salir nombres reales al sitio público.

Las páginas no cambian mientras se respete el esquema.
