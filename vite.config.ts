import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ---------------------------------------------------------
// VITE CONFIGURATION
// ---------------------------------------------------------

export default defineConfig({
  plugins: [react()],

  // During development, React runs on Vite's port while our
  // Express API runs on port 3002.
  //
  // This proxy lets the frontend request "/api/..."
  // without needing to know the backend's actual address.
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
      },
    },
  },
});