import React, { useState } from "react";
import { PortfolioFile, LiveData } from "../types";
import { PortfolioContext } from "./usePortfolio";

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<PortfolioFile | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [liveByTicker, setLiveByTicker] = useState<Map<string, LiveData>>(new Map());

  return (
    <PortfolioContext.Provider
      value={{ file, setFile, fileHandle, setFileHandle, liveByTicker, setLiveByTicker }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
