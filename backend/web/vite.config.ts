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
    port: 5173,
    proxy: {
      // En desarrollo local, backend/ corre en localhost:8787 (wrangler dev).
      "/v1": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
