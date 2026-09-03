import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Frontend de Bloom (Login + ABM de usuarios). Ver README.md para el estado
// real de qué endpoints ya existen en backend/ y cuáles todavía no.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // 8788, NO 5173 (default de Vite): 5173 esta reservado por el Control
    // Plane de Nucleus para el Svelte dev server de la webview — ver
    // docs/BOOTSTRAP/BOOTSTRAP_CONTROL_PLANE.md y
    // docs/BACKEND/Registro_Puertos_Locales_v0_1.md.
    port: 8788,
    strictPort: true,
    proxy: {
      // En desarrollo local, backend/ corre en localhost:8787 (wrangler dev).
      "/v1": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
