import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths keep the build compatible with GitHub Pages project sites.
  base: "./",
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
