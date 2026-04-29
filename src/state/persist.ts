import { effect, type Signal } from '@preact/signals';

/**
 * Hydrate a signal from localStorage and keep it in sync via an effect.
 * Tolerates:
 *   - storage access exceptions (Safari private mode, disabled storage)
 *   - corrupt JSON
 *   - syntactically-valid-but-wrong-shape persisted values (e.g. 'null', '{}', 'true', '42'
 *     when the signal expects an array). Wrong-shape values are rejected and the default
 *     is preserved — preventing render crashes from `null.includes(...)` etc.
 *   - quota-exceeded writes
 *
 * Shape check: the parsed value must match the signal's *current* (default) value's
 * top-level shape — array vs plain-object vs primitive (and same `typeof` for primitives).
 * Deeper schema validation is intentionally not done here; that's the caller's responsibility.
 */
export function persist<T>(sig: Signal<T>, key: string): Signal<T> {
  if (typeof window === 'undefined') return sig;

  // Read path
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(key);
  } catch {
    return sig; // storage unavailable; signal stays in-memory only
  }
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      const def: unknown = sig.value;
      const parsedIsArray = Array.isArray(parsed);
      const defIsArray = Array.isArray(def);
      const parsedIsObject = parsed !== null && typeof parsed === 'object' && !parsedIsArray;
      const defIsObject = def !== null && typeof def === 'object' && !defIsArray;
      const sameShape =
        (parsedIsArray && defIsArray) ||
        (parsedIsObject && defIsObject) ||
        (!parsedIsArray && !defIsArray && !parsedIsObject && !defIsObject && typeof parsed === typeof def);
      if (sameShape) {
        sig.value = parsed as T;
      }
      // else: shape mismatch — keep default; persisted value is silently ignored.
    } catch {
      // corrupt JSON; keep default
    }
  }

  // Write path
  effect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(sig.value));
    } catch {
      // quota exceeded / storage unavailable; degrade silently to in-memory only
    }
  });

  return sig;
}
