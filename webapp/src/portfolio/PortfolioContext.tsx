import React, { createContext, useContext, useState } from "react";
import { PortfolioFile, LiveData } from "../types";

interface PortfolioContextValue {
  file: PortfolioFile | null;
  setFile: (file: PortfolioFile) => void;
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  liveByTicker: Map<string, LiveData>;
  setLiveByTicker: (liveByTicker: Map<string, LiveData>) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

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

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return ctx;
}
