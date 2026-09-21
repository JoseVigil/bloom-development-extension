import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  onwarn: (warning, defaultHandler) => {
    const ignoredCodes = [
      'a11y_no_redundant_roles',
      'a11y_click_events_have_key_events',
      'a11y_no_static_element_interactions',
      'css_unused_selector'
    ];

    if (ignoredCodes.includes(warning.code)) {
      return;
    }

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
    },
    alias: {
      $contracts: '../../contracts',
      // Integración formal Orrery — Spec_Implementacion_Integracion_Core_Orrery_v1_0.md
      // §1.4. Orrery es un paquete npm separado (installer/conductor/workspace/core/orrery,
      // su propio package.json/vite.config.ts, sin workspace ni dependencia declarada
      // hacia/desde este paquete). Se reutiliza el mismo mecanismo ya establecido acá
      // para $contracts — un alias de Vite/SvelteKit hacia el código fuente de un
      // directorio hermano del monorepo — en vez de introducir un nuevo mecanismo de
      // enlace (npm link, workspace). $orrery/main resuelve a mountOrreryScene() sin
      // que webview/app dependa de un paso de build o instalación adicional.
      $orrery: '../../installer/conductor/workspace/core/orrery/src'
    }
  }
};

export default config;
