export function makeLocalStoragePref<T>(
  key: string,
  defaultValue: T,
  serialize: (value: T) => string = String,
  deserialize: (raw: string) => T = (raw) => raw as unknown as T
): { load: () => T; save: (value: T) => void } {
  return {
    load: () => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? defaultValue : deserialize(raw);
      } catch {
        return defaultValue;
      }
    },
    save: (value: T) => {
      try {
        localStorage.setItem(key, serialize(value));
      } catch {
        // Swallow error — persistence is best-effort
      }
    },
  };
}
