import { createContext, useContext } from "react";
import { AppError } from "./errorReducer";

export interface ErrorContextValue {
  errors: AppError[];
  addError: (source: string, message: string) => void;
  clearError: (id: string) => void;
  clearBySource: (source: string) => void;
}

export const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useErrors(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useErrors must be used within an ErrorProvider");
  return ctx;
}
