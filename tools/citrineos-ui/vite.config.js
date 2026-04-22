import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy CitrineOS REST + Hasura GraphQL to avoid CORS in dev.
// Override targets via env: VITE_CITRINE_HOST (default localhost), VITE_CITRINE_API_PORT (8080), VITE_CITRINE_GQL_PORT (8090).
const host = process.env.VITE_CITRINE_HOST || 'localhost';
const apiPort = process.env.VITE_CITRINE_API_PORT || '8080';
const gqlPort = process.env.VITE_CITRINE_GQL_PORT || '8090';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ocpp': { target: `http://${host}:${apiPort}`, changeOrigin: true },
      '/data': { target: `http://${host}:${apiPort}`, changeOrigin: true },
      '/v1': { target: `http://${host}:${gqlPort}`, changeOrigin: true },
    },
  },
});
