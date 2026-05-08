import '@testing-library/jest-dom/vitest';

// Vitest's jsdom env doesn't expose `localStorage` / `sessionStorage` /
// `indexedDB` on globalThis (its KEYS list pre-dates the Storage spec), and
// Node 25 ships a stub `globalThis.localStorage` that lacks
// getItem/setItem/clear, so naive access hits the broken stub. Bridge jsdom's
// real storage objects (reachable via `globalThis.jsdom.window`) onto
// globalThis here.
const jsdom = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom;
if (jsdom) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: jsdom.window.localStorage,
    writable: true,
    configurable: true
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: jsdom.window.sessionStorage,
    writable: true,
    configurable: true
  });
}
