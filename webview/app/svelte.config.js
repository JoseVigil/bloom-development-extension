import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  // Aquí filtramos los warnings más molestos durante desarrollo
  onwarn: (warning, defaultHandler) => {
    // Lista de códigos que queremos ignorar completamente (los que veías constantemente)
    const ignoredCodes = [
      'a11y_no_redundant_roles',              // Redundant role 'main'
      'a11y_click_events_have_key_events',    // Falta handler de teclado en click
      'a11y_no_static_element_interactions',  // div con click sin role
      'css_unused_selector'                   // Selector CSS no usado (ej: ".empty-state span")
    ];

    if (ignoredCodes.includes(warning.code)) {
      // No mostramos nada en consola para estos
      return;
    }

    // Para todos los demás warnings, usamos el comportamiento por defecto
    defaultHandler(warning);
  },

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: ''
    }
  }
};

export default config;