import React, { useCallback, useReducer } from "react";
import { errorReducer, initialErrorState } from "./errorReducer";
import { ErrorContext } from "./useErrors";

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
