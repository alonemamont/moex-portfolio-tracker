import { useErrors } from "./useErrors";
import "./ErrorPanel.css";

export function ErrorPanel() {
  const { errors, clearError } = useErrors();

  if (errors.length === 0) return null;

  return (
    <aside className="error-panel" aria-label="Ошибки">
      {errors.map((error) => (
        <div key={error.id} className="error-panel__item">
          <span className="error-panel__message">{error.message}</span>
          <button
            type="button"
            className="error-panel__close"
            aria-label="Закрыть"
            onClick={() => clearError(error.id)}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  );
}
