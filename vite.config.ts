import { defineConfig } from 'vite';

export default defineConfig({
  // Inline GLSL shaders are handled as plain strings via ?raw imports.
  // No special plugin required since we embed GLSL in TypeScript template literals.
  server: {
    port: 5173,
    // Required for getUserMedia: Chrome allows camera on localhost without HTTPS.
    // In production, HTTPS is mandatory.
    host: 'localhost',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
