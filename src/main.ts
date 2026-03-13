/**
 * Entry point.
 * Creates the App instance and initializes it when the DOM is ready.
 */

import { App } from './app/bootstrap';

const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Expose app for debugging in the browser console (dev mode only)
if (import.meta.env.MODE !== 'production') {
  (window as unknown as Record<string, unknown>).__app = app;
}
