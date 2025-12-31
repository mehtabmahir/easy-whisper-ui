import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "./src/renderer",
  base: "./",
  publicDir: path.resolve(__dirname, "../resources"),
  plugins: [react()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/index.html")
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer")
    }
  }
});
