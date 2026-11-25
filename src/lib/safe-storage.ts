/** Storage can be disabled by browser privacy settings or exhausted quotas. */
export function readStoredValue(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = readStoredValue(key);
    return value == null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
