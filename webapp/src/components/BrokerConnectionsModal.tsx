import { useState } from "react";
import { BrokerConnection, PortfolioFile } from "../types";
import { useErrors } from "../errors/useErrors";
import { getBrokerAdapter } from "../brokers/registry";
import { decryptToken } from "../brokers/crypto";
import { getSessionToken, setSessionToken, clearSessionToken } from "../brokers/tokenSession";
import { fetchBrokerSyncPreview } from "../portfolio/runBrokerSync";
import { applySyncDiff, SyncDiffRow } from "../brokers/syncDiff";
import { AddBrokerConnectionForm } from "./AddBrokerConnectionForm";
import { BrokerSyncPreviewModal } from "./BrokerSyncPreviewModal";
import { isBrokerSyncAvailable, WINDOWS_RELEASE_URL } from "./brokerAvailability";
import { logBrokerSyncError, logBrokerSyncInfo } from "../brokers/diagnostics";

const SOURCE = "broker-sync";

export function BrokerConnectionsModal({
  file,
  onUpdateFile,
  onClose,
}: {
  file: PortfolioFile;
  onUpdateFile: (file: PortfolioFile) => void;
  onClose: () => void;
}) {
  const { addError, clearBySource } = useErrors();
  const [showAddForm, setShowAddForm] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [pendingSyncAfterUnlock, setPendingSyncAfterUnlock] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ connection: BrokerConnection; rows: SyncDiffRow[] } | null>(
    null
  );

  async function runSync(connection: BrokerConnection, token: string) {
    clearBySource(SOURCE);
    setSyncingId(connection.id);
    logBrokerSyncInfo("ui.sync.start", {
      connectionId: connection.id,
      brokerId: connection.brokerId,
      accountId: connection.accountId,
      locked: getSessionToken(connection.id) === null,
    });
    try {
      const rows = await fetchBrokerSyncPreview(file, connection, token);
      logBrokerSyncInfo("ui.sync.previewReady", {
        connectionId: connection.id,
        rows: rows.length,
      });
      setPreviewState({ connection, rows });
    } catch (error) {
      logBrokerSyncError("ui.sync.failed", error, {
        connectionId: connection.id,
        brokerId: connection.brokerId,
        accountId: connection.accountId,
      });
      addError(SOURCE, (error as Error).message);
    } finally {
      setSyncingId(null);
    }
  }

  function handleSyncClick(connection: BrokerConnection) {
    const cached = getSessionToken(connection.id);
    if (cached) {
      void runSync(connection, cached);
      return;
    }
    setUnlockingId(connection.id);
    setPendingSyncAfterUnlock(true);
    setPassphraseInput("");
    setUnlockError(null);
  }

  function handleUnlockClick(connection: BrokerConnection) {
    setUnlockingId(connection.id);
    setPendingSyncAfterUnlock(false);
    setPassphraseInput("");
    setUnlockError(null);
  }

  async function handleUnlockSubmit(connection: BrokerConnection) {
    try {
      const token = await decryptToken(connection.encryptedToken, passphraseInput);
      setSessionToken(connection.id, token);
      setUnlockingId(null);
      setPassphraseInput("");
      setUnlockError(null);
      if (pendingSyncAfterUnlock) {
        await runSync(connection, token);
      }
    } catch {
      setUnlockError("Неверный пароль");
    }
  }

  function handleRemoveConnection(connectionId: string) {
    clearSessionToken(connectionId);
    onUpdateFile({
      ...file,
      brokerConnections: file.brokerConnections.filter((c) => c.id !== connectionId),
    });
  }

  function handleAddConnection(connection: BrokerConnection) {
    onUpdateFile({ ...file, brokerConnections: [...file.brokerConnections, connection] });
    setShowAddForm(false);
  }

  function handleConfirmSync() {
    if (!previewState) return;
    const updated = applySyncDiff(
      file,
      previewState.connection.id,
      previewState.rows,
      new Date().toISOString()
    );
    onUpdateFile(updated);
    setPreviewState(null);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Брокеры">
      <div className="modal">
        <h2>Брокеры</h2>
        <div className="broker-connections__list">
          {file.brokerConnections.map((connection) => {
            const adapter = getBrokerAdapter(connection.brokerId);
            const isLocked = getSessionToken(connection.id) === null;
            const syncAvailable = isBrokerSyncAvailable(connection.brokerId);
            return (
              <div className="broker-connections__row" key={connection.id}>
                <span>
                  {isLocked ? "🔒 " : ""}
                  {connection.label} ({adapter?.label ?? connection.brokerId})
                </span>
                <div className="modal__actions">
                  {isLocked && (
                    <button type="button" onClick={() => handleUnlockClick(connection)}>
                      Разблокировать
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSyncClick(connection)}
                    disabled={syncingId === connection.id || !syncAvailable}
                  >
                    {syncingId === connection.id ? "Синхронизация…" : "Синхронизировать"}
                  </button>
                  <button type="button" onClick={() => handleRemoveConnection(connection.id)}>
                    Удалить
                  </button>
                </div>
                {connection.brokerId === "tbank" && !syncAvailable && (
                  <p className="broker-connections__desktop-notice">
                    Синхронизация с Т-Банком доступна в приложении для Windows.{" "}
                    <a href={WINDOWS_RELEASE_URL} target="_blank" rel="noreferrer">
                      Скачать portable-версию
                    </a>
                  </p>
                )}
                {unlockingId === connection.id && (
                  <div className="add-ticker__field">
                    <input
                      type="password"
                      placeholder="Пароль-фраза"
                      value={passphraseInput}
                      onChange={(e) => setPassphraseInput(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => void handleUnlockSubmit(connection)}>
                      Ок
                    </button>
                    {unlockError && <span className="add-ticker__status">{unlockError}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {showAddForm ? (
          <AddBrokerConnectionForm
            isFirstConnection={file.brokerConnections.length === 0}
            onAdd={handleAddConnection}
            onCancel={() => setShowAddForm(false)}
          />
        ) : (
          <div className="modal__actions">
            <button type="button" onClick={() => setShowAddForm(true)}>
              Добавить подключение
            </button>
            <button type="button" onClick={onClose}>
              Закрыть
            </button>
          </div>
        )}
      </div>
      {previewState && (
        <BrokerSyncPreviewModal
          connectionLabel={previewState.connection.label}
          rows={previewState.rows}
          onConfirm={handleConfirmSync}
          onClose={() => setPreviewState(null)}
        />
      )}
    </div>
  );
}
