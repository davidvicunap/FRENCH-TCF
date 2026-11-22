import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds one self-contained HTML file: it works from GitHub Pages and also
// when opened directly from disk (double-click), like the v1 app.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  test: { include: ["src/**/*.test.ts"] },
});
