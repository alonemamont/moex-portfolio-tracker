import { useRef, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { createEmptyPortfolio } from "../file/createEmptyPortfolio";
import { mergeCompletedMarketUpdate, switchIndex } from "../portfolio/runMarketUpdate";
import { INDEX_OPTIONS } from "../domain/indices";
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
import { BrokerConnectionsModal } from "./BrokerConnectionsModal";
import { describeDiagnosticError } from "../brokers/diagnostics";

const SOURCE = "file";
const INDEX_SOURCE = "index-switch";

export function Header({ onFileLoaded }: { onFileLoaded: () => void }) {
  const {
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
  } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showBrokerConnections, setShowBrokerConnections] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      addError(SOURCE, `Не удалось загрузить файл: ${describeDiagnosticError(error)}`);
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
      addError(SOURCE, `Не удалось загрузить файл: ${describeDiagnosticError(error)}`);
    }
  }

  async function handleStartEmpty() {
    clearBySource(SOURCE);
    try {
      const empty = await createEmptyPortfolio();
      setFile(empty);
      setFileHandle(null);
    } catch (error) {
      addError(SOURCE, `Не удалось создать пустой портфель: ${describeDiagnosticError(error)}`);
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
      addError(SOURCE, `Не удалось сохранить файл: ${describeDiagnosticError(error)}`);
    }
  }

  async function handleIndexChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const newIndexId = event.target.value;
    if (!file || newIndexId === selectedIndex) return;
    setIsUpdating(true);
    clearBySource(INDEX_SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await switchIndex(
        file,
        liveByTicker,
        newIndexId
      );
      setFile((current) => current ? mergeCompletedMarketUpdate(current, updated) : current);
      setLiveByTicker(newLiveByTicker);
      setSelectedIndex(newIndexId);
    } catch (error) {
      addError(INDEX_SOURCE, `Не удалось переключить индекс: ${describeDiagnosticError(error)}`);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
      <header className="header">
        <h1 className="header__title">
          <select
            className="header__brand"
            value={selectedIndex}
            disabled={!file || isUpdating}
            onChange={handleIndexChange}
          >
            {INDEX_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="header__title-text">Портфель-трекер</span>
        </h1>
        <button
          type="button"
          className="header__menu-toggle"
          aria-label="Меню"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          ⋮
        </button>
        <div className={`header__actions${menuOpen ? " header__actions--open" : ""}`}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleLoadClick();
            }}
          >
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
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                handleStartEmpty();
              }}
            >
              Начать с пустого портфеля
            </button>
          )}
          {file && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                handleSaveClick();
              }}
            >
              Сохранить
            </button>
          )}
          {file && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowBrokerConnections(true);
              }}
            >
              Брокеры
            </button>
          )}
        </div>
      </header>
      {file && showBrokerConnections && (
        <BrokerConnectionsModal
          file={file}
          onUpdateFile={setFile}
          onClose={() => setShowBrokerConnections(false)}
        />
      )}
    </>
  );
}
