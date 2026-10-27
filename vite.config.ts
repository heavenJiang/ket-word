import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.KET_BASE ?? "/",
  plugins: [react()],
  server: { port: 5199 },
});
