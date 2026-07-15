import { useState } from "react";
import { encryptToken } from "../brokers/crypto";
import { BROKER_REGISTRY, getBrokerAdapter } from "../brokers/registry";
import { BrokerAccount } from "../brokers/types";
import { isTauriRuntime } from "../runtime/isTauriRuntime";
import { BrokerConnection } from "../types";

export const WINDOWS_RELEASE_URL = "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest";

export function isBrokerSyncAvailable(brokerId: string): boolean {
  return brokerId !== "tbank" || isTauriRuntime();
}

export function AddBrokerConnectionForm({
  isFirstConnection,
  onAdd,
  onCancel,
}: {
  isFirstConnection: boolean;
  onAdd: (connection: BrokerConnection) => void;
  onCancel: () => void;
}) {
  const [brokerId, setBrokerId] = useState(BROKER_REGISTRY[0].id);
  const [tokenInput, setTokenInput] = useState("");
  const [accounts, setAccounts] = useState<BrokerAccount[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [passphraseInput, setPassphraseInput] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adapter = getBrokerAdapter(brokerId)!;
  const syncAvailable = isBrokerSyncAvailable(brokerId);

  async function handleFetchAccounts() {
    if (!syncAvailable) return;

    setError(null);
    setLoadingAccounts(true);
    try {
      const fetched = await adapter.listAccounts(tokenInput);
      setAccounts(fetched);
      if (fetched.length > 0) {
        setSelectedAccountId(fetched[0].id);
        setLabelInput(`${adapter.label} — ${fetched[0].name}`);
      }
    } catch (err) {
      setError(`Не удалось подключиться, возможно ограничение брокера: ${(err as Error).message}`);
      setAccounts(null);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function handleAdd() {
    if (!selectedAccountId || !labelInput.trim() || !passphraseInput) return;

    setError(null);
    try {
      const encryptedToken = await encryptToken(tokenInput, passphraseInput);
      onAdd({
        id: crypto.randomUUID(),
        brokerId,
        accountId: selectedAccountId,
        label: labelInput.trim(),
        encryptedToken,
      });
    } catch (err) {
      setError(`Не удалось зашифровать токен: ${(err as Error).message}`);
    }
  }

  const canAdd = accounts !== null && selectedAccountId !== "" && labelInput.trim() !== "" && passphraseInput !== "";

  return (
    <div className="broker-connections__add-form">
      {isFirstConnection && (
        <p className="broker-connections__warning">
          Токен брокера сохраняется в файле портфеля в зашифрованном виде. Передавая `portfolio.json`
          дальше, вы передаёте и зашифрованные токены — безопасность зависит от стойкости пароль-фразы.
        </p>
      )}
      <div className="add-ticker__field">
        <select
          aria-label="Брокер"
          value={brokerId}
          onChange={(e) => {
            setBrokerId(e.target.value);
            setAccounts(null);
          }}
        >
          {BROKER_REGISTRY.map((broker) => (
            <option key={broker.id} value={broker.id}>
              {broker.label}
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Токен"
          value={tokenInput}
          onChange={(e) => {
            setTokenInput(e.target.value);
            setAccounts(null);
          }}
        />
        <button type="button" onClick={handleFetchAccounts} disabled={!tokenInput || loadingAccounts || !syncAvailable}>
          {loadingAccounts ? "Проверка…" : "Проверить и продолжить"}
        </button>
      </div>
      {brokerId === "tbank" && !syncAvailable && (
        <p className="broker-connections__desktop-notice">
          <span>Синхронизация с Т-Банком доступна в приложении для Windows.</span>{" "}
          <a href={WINDOWS_RELEASE_URL} target="_blank" rel="noreferrer">
            Скачать portable-версию
          </a>
        </p>
      )}
      {error && <span className="add-ticker__status">{error}</span>}
      {accounts && (
        <div className="add-ticker__field">
          <select
            aria-label="Счёт брокера"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Название подключения"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
          />
          <input
            type="password"
            placeholder="Пароль-фраза для шифрования токена"
            value={passphraseInput}
            onChange={(e) => setPassphraseInput(e.target.value)}
          />
        </div>
      )}
      <div className="modal__actions">
        <button type="button" onClick={handleAdd} disabled={!canAdd}>
          Добавить
        </button>
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
