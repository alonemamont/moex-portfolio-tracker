import { makeLocalStoragePref } from "./localStoragePref";

export function loadSelectedIndexPref(defaultIndexId: string): string {
  return makeLocalStoragePref("moex-portfolio-tracker:selectedIndex", defaultIndexId).load();
}

export function saveSelectedIndexPref(value: string): void {
  makeLocalStoragePref("moex-portfolio-tracker:selectedIndex", value).save(value);
}
