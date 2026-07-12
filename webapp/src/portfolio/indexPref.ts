const SELECTED_INDEX_KEY = "moex-portfolio-tracker:selectedIndex";

export function loadSelectedIndexPref(defaultIndexId: string): string {
  try {
    return localStorage.getItem(SELECTED_INDEX_KEY) ?? defaultIndexId;
  } catch {
    return defaultIndexId;
  }
}

export function saveSelectedIndexPref(value: string): void {
  try {
    localStorage.setItem(SELECTED_INDEX_KEY, value);
  } catch {
    // Swallow error — persistence is best-effort
  }
}
