import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLE=1 bygger allt till en fristående index.html (lätt att dela/öppna lokalt).
export default defineConfig({
  base: "./",
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  build: { outDir: process.env.SINGLE ? "dist-single" : "dist", chunkSizeWarningLimit: 1500 },
});
