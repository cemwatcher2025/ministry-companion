import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ministry-companion/",   // 👈 IMPORTANT for GitHub Pages
  plugins: [react()],
});
