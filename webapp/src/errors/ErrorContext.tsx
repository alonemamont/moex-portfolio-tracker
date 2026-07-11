import React, { createContext, useCallback, useContext, useReducer } from "react";
import { errorReducer, initialErrorState, AppError } from "./errorReducer";

interface ErrorContextValue {
  errors: AppError[];
  addError: (source: string, message: string) => void;
  clearError: (id: string) => void;
  clearBySource: (source: string) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(errorReducer, initialErrorState);

  const addError = useCallback((source: string, message: string) => {
    dispatch({ type: "add", source, message });
  }, []);
  const clearError = useCallback((id: string) => {
    dispatch({ type: "clear", id });
  }, []);
  const clearBySource = useCallback((source: string) => {
    dispatch({ type: "clearBySource", source });
  }, []);

  return (
    <ErrorContext.Provider value={{ errors: state.errors, addError, clearError, clearBySource }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useErrors(): ErrorContextValue {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useErrors must be used within an ErrorProvider");
  return ctx;
}
