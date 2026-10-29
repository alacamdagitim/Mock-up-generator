import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        page: "index.html",
        demo: "launcher-demo.html",
        mockupDemo: "mockup-demo.html",
        handCupDemo: "hand-cup-demo.html",
        editor: "src/main.tsx",
        launcher: "src/launcher.ts",
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "alacam-[name].js",
        chunkFileNames: "alacam-[name]-[hash].js",
        assetFileNames: "alacam-[name].[ext]",
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
