import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/marked/") ||
            id.includes("node_modules/dompurify/")
          )
            return "markdown";
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/victory")
          )
            return "charts";
          if (id.includes("node_modules/")) return "vendor";
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:" + (process.env.STUDYBUDDY_API_PORT || "3001"),
    },
  },
  preview: {
    proxy: {
      "/api": "http://127.0.0.1:" + (process.env.STUDYBUDDY_API_PORT || "3001"),
    },
  },
});
