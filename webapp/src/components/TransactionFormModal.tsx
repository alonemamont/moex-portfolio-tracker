import { FormEvent, useState } from "react";
import { BrokerAccount, Transaction, TransactionCurrency, TransactionType } from "../types";
import {
  TransactionDraft,
  TransactionFieldErrors,
  validateTransactionDraft,
} from "../domain/transactions";

function localDateValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function TransactionFormModal({
  transaction,
  accounts,
  onSave,
  onClose,
}: {
  transaction: Transaction | null;
  accounts: BrokerAccount[];
  onSave: (draft: TransactionDraft) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "deposit");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [currency, setCurrency] = useState<TransactionCurrency>(transaction?.currency ?? "RUB");
  const [date, setDate] = useState(transaction?.date ?? localDateValue());
  const [accountId, setAccountId] = useState(transaction?.accountId ?? "");
  const [comment, setComment] = useState(transaction?.comment ?? "");
  const [errors, setErrors] = useState<TransactionFieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const draft: TransactionDraft = {
      type,
      amount: Number(amount),
      currency,
      date,
      comment,
      ...(accountId ? { accountId } : {}),
    };
    const nextErrors = validateTransactionDraft(draft, accounts);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSave(draft);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={transaction ? "Редактировать транзакцию" : "Добавить транзакцию"}>
      <form className="modal transaction-form" onSubmit={handleSubmit}>
        <h2>{transaction ? "Редактировать транзакцию" : "Добавить транзакцию"}</h2>
        <label>Тип
          <select value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
            <option value="deposit">Пополнение</option>
            <option value="withdrawal">Вывод</option>
          </select>
        </label>
        <label>Сумма
          <input type="number" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
          {errors.amount && <span className="field-error">{errors.amount}</span>}
        </label>
        <label>Валюта
          <select value={currency} onChange={(event) => setCurrency(event.target.value as TransactionCurrency)}>
            <option value="RUB">RUB</option><option value="USD">USD</option><option value="CNY">CNY</option>
          </select>
        </label>
        <label>Дата
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          {errors.date && <span className="field-error">{errors.date}</span>}
        </label>
        <label>Счёт
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Общий портфель</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          {errors.accountId && <span className="field-error">{errors.accountId}</span>}
        </label>
        <label>Комментарий
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
        <div className="modal__actions">
          <button type="submit">Сохранить</button>
          <button type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
