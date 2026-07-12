import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production")
  },
  build: {
    outDir: "dist/webview/current-session",
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "src/ui/webview/currentSession/index.tsx"),
      formats: ["es"],
      fileName: "current-session",
      cssFileName: "current-session"
    },
    rollupOptions: {
      output: {
        entryFileNames: "current-session.js"
      }
    }
  }
});
