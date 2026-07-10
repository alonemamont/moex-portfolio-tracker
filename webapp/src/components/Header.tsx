import { useRef } from "react";
import { usePortfolio } from "../portfolio/PortfolioContext";
import { useErrors } from "../errors/ErrorContext";
import { createEmptyPortfolio } from "../file/createEmptyPortfolio";
import {
  isFileSystemAccessSupported,
  loadViaFileSystemAccess,
  loadViaInputFile,
} from "../file/loadPortfolioFile";
import {
  saveViaFileSystemAccess,
  saveViaFileSystemAccessNew,
  downloadPortfolioFile,
} from "../file/savePortfolioFile";

const SOURCE = "file";

export function Header({ onFileLoaded }: { onFileLoaded: () => void }) {
  const { file, setFile, fileHandle, setFileHandle } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleLoadClick() {
    clearBySource(SOURCE);
    try {
      if (isFileSystemAccessSupported()) {
        const { file: loaded, handle } = await loadViaFileSystemAccess();
        setFile(loaded);
        setFileHandle(handle);
        onFileLoaded();
      } else {
        inputRef.current?.click();
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      addError(SOURCE, `Не удалось загрузить файл: ${(error as Error).message}`);
    }
  }

  async function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    try {
      const loaded = await loadViaInputFile(selected);
      setFile(loaded);
      setFileHandle(null);
      onFileLoaded();
    } catch (error) {
      addError(SOURCE, `Не удалось загрузить файл: ${(error as Error).message}`);
    }
  }

  async function handleStartEmpty() {
    clearBySource(SOURCE);
    try {
      const empty = await createEmptyPortfolio();
      setFile(empty);
      setFileHandle(null);
    } catch (error) {
      addError(SOURCE, `Не удалось создать пустой портфель: ${(error as Error).message}`);
    }
  }

  async function handleSaveClick() {
    if (!file) return;
    clearBySource(SOURCE);
    try {
      if (fileHandle) {
        await saveViaFileSystemAccess(file, fileHandle);
      } else if (isFileSystemAccessSupported()) {
        const handle = await saveViaFileSystemAccessNew(file);
        setFileHandle(handle);
      } else {
        downloadPortfolioFile(file);
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      addError(SOURCE, `Не удалось сохранить файл: ${(error as Error).message}`);
    }
  }

  return (
    <header className="header">
      <h1>Портфель-трекер IMOEX</h1>
      <div className="header__actions">
        <button type="button" onClick={handleLoadClick}>
          Загрузить файл
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
        {!file && (
          <button type="button" onClick={handleStartEmpty}>
            Начать с пустого портфеля
          </button>
        )}
        {file && (
          <button type="button" onClick={handleSaveClick}>
            Сохранить
          </button>
        )}
      </div>
    </header>
  );
}
