import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ---------------------------------------------------------
// VITE CONFIGURATION
// ---------------------------------------------------------

export default defineConfig(({ mode }) => {
  if (mode !== "development" && mode !== "test" && mode !== "production") throw new Error("Unsupported Vite environment.");
  const test = mode === "test";
  return {
  plugins: [react()],

  // During development, React runs on Vite's port while our
  // Express API runs on port 3002.
  //
  // This proxy lets the frontend request "/api/..."
  // without needing to know the backend's actual address.
  server: {
    port: test ? 5174 : 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: test ? "http://127.0.0.1:3003" : "http://127.0.0.1:3002",
        changeOrigin: true,
      },
    },
  },
  };
});
