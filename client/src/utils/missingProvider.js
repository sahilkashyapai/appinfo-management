// Context hooks fall back to a harmless default instead of returning null when
// their provider isn't found. That happens briefly during a Vite hot reload
// (the edited module re-creates its context object while the mounted provider
// still holds the old one), and destructuring null would crash the whole page.
const warned = new Set();

export function warnMissingProvider(hookName) {
  if (import.meta.env.DEV && !warned.has(hookName)) {
    warned.add(hookName);
    console.warn(`${hookName}() was called outside its provider - using a fallback. Usually a hot-reload artefact; reload the page if it persists.`);
  }
}
