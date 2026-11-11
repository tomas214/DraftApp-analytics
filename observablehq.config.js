// Configuración de Observable Framework.
// https://observablehq.com/framework/config
export default {
  root: "src",
  title: "DraftApp Analytics",

  // El sitio vive en https://tomas214.github.io/DraftApp-analytics/ (GitHub Pages de proyecto).
  base: "/DraftApp-analytics/",

  // OJO: `style` y `theme` son excluyentes. El tema (claro/oscuro automático + layout "dashboard")
  // se importa dentro de src/style.css.

  // Navegación lateral automática con las páginas de src/ (Resumen, Detalle).
  sidebar: true,
  pager: false,
  toc: false,
  style: "style.css",
  footer: "DraftApp Analytics · datos sintéticos de ejemplo"
};
