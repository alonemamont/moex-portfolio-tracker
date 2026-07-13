import { useState } from "react";
import { PortfolioFile } from "../types";
import {
  countAccountTransactions,
  createBrokerAccount,
  deleteBrokerAccount,
  renameBrokerAccount,
  validateAccountName,
} from "../domain/brokerAccounts";

export function BrokerAccountsModal({
  file,
  onChange,
  onClose,
}: {
  file: PortfolioFile;
  onChange: (file: PortfolioFile) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>(
    Object.fromEntries(file.brokerAccounts.map((account) => [account.id, account.name]))
  );
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function handleAdd() {
    const error = validateAccountName(newName, file.brokerAccounts);
    setNewNameError(error);
    if (error) return;
    onChange(createBrokerAccount(file, newName, crypto.randomUUID()));
    setNewName("");
  }

  function handleRename(id: string) {
    const value = draftNames[id] ?? "";
    const error = validateAccountName(value, file.brokerAccounts, id);
    setRowErrors((current) => ({ ...current, [id]: error ?? "" }));
    if (!error) {
      const renamedFile = renameBrokerAccount(file, id, value);
      onChange(renamedFile);
      const renamedAccount = renamedFile.brokerAccounts.find((account) => account.id === id);
      if (renamedAccount) {
        setDraftNames((current) => ({ ...current, [id]: renamedAccount.name }));
      }
    }
  }

  function handleDelete(id: string, name: string) {
    const count = countAccountTransactions(file, id);
    if (!window.confirm(`Удалить счёт «${name}»? ${count} транзакций будет переведено в «Общий портфель».`)) return;
    onChange(deleteBrokerAccount(file, id));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Счета">
      <div className="modal accounts-modal">
        <h2>Счета</h2>
        <div className="account-add-row">
          <label>Новый счёт
            <input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} />
            {newNameError && <span className="field-error">{newNameError}</span>}
          </label>
          <button type="button" onClick={handleAdd}>Добавить</button>
        </div>
        {file.brokerAccounts.length === 0 ? <p className="empty-state">Ручных счетов пока нет.</p> : (
          <div className="account-list">
            {file.brokerAccounts.map((account) => (
              <div className="account-row" key={account.id}>
                <label>Название
                  <input
                    type="text"
                    value={draftNames[account.id] ?? account.name}
                    onChange={(event) => setDraftNames((current) => ({ ...current, [account.id]: event.target.value }))}
                  />
                  {rowErrors[account.id] && <span className="field-error">{rowErrors[account.id]}</span>}
                </label>
                <button type="button" onClick={() => handleRename(account.id)}>Переименовать</button>
                <button type="button" onClick={() => handleDelete(account.id, account.name)}>Удалить</button>
              </div>
            ))}
          </div>
        )}
        <div className="modal__actions"><button type="button" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  );
}
