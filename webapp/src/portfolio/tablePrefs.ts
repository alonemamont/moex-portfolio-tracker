const SEARCH_KEY = "portfolio.search";
const HIDE_EMPTY_KEY = "portfolio.hideEmpty";

export function loadSearchPref(): string {
  return localStorage.getItem(SEARCH_KEY) ?? "";
}

export function saveSearchPref(value: string): void {
  localStorage.setItem(SEARCH_KEY, value);
}

export function loadHideEmptyPref(): boolean {
  return localStorage.getItem(HIDE_EMPTY_KEY) === "true";
}

export function saveHideEmptyPref(value: boolean): void {
  localStorage.setItem(HIDE_EMPTY_KEY, String(value));
}
