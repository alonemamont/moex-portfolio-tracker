import { createContext, useContext, Dispatch, SetStateAction } from "react";
import { PortfolioFile, LiveData } from "../types";

export interface PortfolioContextValue {
  file: PortfolioFile | null;
  setFile: Dispatch<SetStateAction<PortfolioFile | null>>;
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  liveByTicker: Map<string, LiveData>;
  setLiveByTicker: (liveByTicker: Map<string, LiveData>) => void;
  selectedIndex: string;
  setSelectedIndex: (indexId: string) => void;
  isUpdating: boolean;
  setIsUpdating: (isUpdating: boolean) => void;
}

export const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within a PortfolioProvider");
  return ctx;
}
