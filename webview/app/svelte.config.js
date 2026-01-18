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
      $contracts: '../../contracts'
    }
  }
};

export default config;