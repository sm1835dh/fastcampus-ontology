import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // The workspace measures its date windows from the same anchor the API uses,
  // so COURSE_NOW is read from the repo-root .env rather than kept in a second
  // copy. Only that one key is injected -- the rest of the root env, DATABASE_URL
  // included, never reaches the bundle.
  const rootEnv = loadEnv(mode, resolve(here, "../.."), "");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_COURSE_NOW": JSON.stringify(rootEnv["COURSE_NOW"] ?? ""),
    },
    server: {
      // The ontology API runs separately; proxying keeps the browser same-origin.
      proxy: {
        "/api": { target: "http://localhost:3000", changeOrigin: true },
      },
    },
  };
});
