import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // The ontology API runs separately; proxying keeps the browser same-origin.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
