import React, { useState, useEffect } from "react";
import { PortfolioFile, LiveData } from "../types";
import { PortfolioContext } from "./usePortfolio";
import { DEFAULT_INDEX_ID, INDEX_OPTIONS } from "../domain/indices";
import { loadSelectedIndexPref, saveSelectedIndexPref } from "./indexPref";

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PortfolioFile | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [liveByTicker, setLiveByTicker] = useState<Map<string, LiveData>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const stored = loadSelectedIndexPref(DEFAULT_INDEX_ID);
    return INDEX_OPTIONS.some((option) => option.id === stored) ? stored : DEFAULT_INDEX_ID;
  });
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    saveSelectedIndexPref(selectedIndex);
  }, [selectedIndex]);

  return (
    <PortfolioContext.Provider
      value={{
        file,
        setFile,
        fileHandle,
        setFileHandle,
        liveByTicker,
        setLiveByTicker,
        selectedIndex,
        setSelectedIndex,
        isUpdating,
        setIsUpdating,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
