// SIGNALMAP_BACKEND_MODE gate. Imported by vite.config.ts and server/api/index.ts.

export function shouldEnableSignalmapFixtures(env = process.env) {
  const mode = env.SIGNALMAP_BACKEND_MODE;
  if (mode === 'live') return false;
  if (mode === 'fixture') return true;
  // No explicit mode: enable in development, disable in production.
  return env.NODE_ENV === 'development';
}

export function isLiveMode(env = process.env) {
  return env.SIGNALMAP_BACKEND_MODE === 'live';
}
