const SEARCH_KEY = "portfolio.search";
const HIDE_EMPTY_KEY = "portfolio.hideEmpty";
const ONLY_IN_INDEX_KEY = "portfolio.onlyInIndex";

export function loadSearchPref(): string {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSearchPref(value: string): void {
  try {
    localStorage.setItem(SEARCH_KEY, value);
  } catch {
    // Swallow error — persistence is best-effort
  }
}

export function loadHideEmptyPref(): boolean {
  try {
    return localStorage.getItem(HIDE_EMPTY_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveHideEmptyPref(value: boolean): void {
  try {
    localStorage.setItem(HIDE_EMPTY_KEY, String(value));
  } catch {
    // Swallow error — persistence is best-effort
  }
}

export function loadOnlyInIndexPref(): boolean {
  try {
    return localStorage.getItem(ONLY_IN_INDEX_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveOnlyInIndexPref(value: boolean): void {
  try {
    localStorage.setItem(ONLY_IN_INDEX_KEY, String(value));
  } catch {
    // Swallow error — persistence is best-effort
  }
}
