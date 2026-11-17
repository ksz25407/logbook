import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Strict Content-Security-Policy for the packaged app (dev needs inline scripts for hot reload).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:";
const csp = {
  name: "csp",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace("<head>", `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

// Renderer (the React UI). Output goes to dist/, loaded by Electron via file://.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), csp],
  server: { port: 5173, strictPort: true },
  build: { outDir: "../../dist", emptyOutDir: true },
});
