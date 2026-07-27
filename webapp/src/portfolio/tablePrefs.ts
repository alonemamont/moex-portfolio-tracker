import { makeLocalStoragePref } from "./localStoragePref";

const searchPref = makeLocalStoragePref("portfolio.search", "");
const hideEmptyPref = makeLocalStoragePref("portfolio.hideEmpty", false, String, (raw) => raw === "true");
const onlyInIndexPref = makeLocalStoragePref("portfolio.onlyInIndex", false, String, (raw) => raw === "true");

export const loadSearchPref = searchPref.load;
export const saveSearchPref = searchPref.save;

export const loadHideEmptyPref = hideEmptyPref.load;
export const saveHideEmptyPref = hideEmptyPref.save;

export const loadOnlyInIndexPref = onlyInIndexPref.load;
export const saveOnlyInIndexPref = onlyInIndexPref.save;
