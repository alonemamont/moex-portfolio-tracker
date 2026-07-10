export interface AppError {
  id: string;
  source: string;
  message: string;
}

export interface ErrorState {
  errors: AppError[];
}

export const initialErrorState: ErrorState = { errors: [] };

export type ErrorAction =
  | { type: "add"; source: string; message: string }
  | { type: "clear"; id: string }
  | { type: "clearBySource"; source: string };

export function errorReducer(state: ErrorState, action: ErrorAction): ErrorState {
  switch (action.type) {
    case "add":
      return {
        errors: [
          ...state.errors,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, source: action.source, message: action.message },
        ],
      };
    case "clear":
      return { errors: state.errors.filter((e) => e.id !== action.id) };
    case "clearBySource":
      return { errors: state.errors.filter((e) => e.source !== action.source) };
    default:
      return state;
  }
}
