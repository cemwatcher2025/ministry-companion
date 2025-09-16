import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ministry-companion/",   // 👈 must include leading & trailing slash
  plugins: [react()],
});

