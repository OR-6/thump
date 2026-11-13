/** localStorage wrapper: every access is guarded; falls back to memory. */
const memory = new Map<string, string>();
const PREFIX = 'thump:';

export function load<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* memory fallback already written */
  }
}
