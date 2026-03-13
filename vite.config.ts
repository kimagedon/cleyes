import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    port: 5173,
    host: true, // Expose on LAN so mobile devices can connect
    // HTTPS provided by basicSsl plugin — required for getUserMedia on non-localhost
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
