import { useMemo, useState } from "react";
import { Transaction } from "../types";
import { usePortfolio } from "../portfolio/usePortfolio";
import {
  CurrencyFilter,
  TransactionDraft,
  createTransaction,
  deleteTransaction,
  selectTransactions,
  summarizeTransactions,
  updateTransaction,
} from "../domain/transactions";
import { BrokerAccountsModal } from "./BrokerAccountsModal";
import { TransactionFormModal } from "./TransactionFormModal";
import { TransactionsList } from "./TransactionsList";

const amountFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function TransactionsTab() {
  const { file, setFile } = usePortfolio();
  const [currency, setCurrency] = useState<CurrencyFilter>("ALL");
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);
  const [showAccounts, setShowAccounts] = useState(false);

  const visibleTransactions = useMemo(
    () => file ? selectTransactions(file.transactions, currency) : [],
    [file, currency]
  );
  const summaries = useMemo(
    () => summarizeTransactions(visibleTransactions),
    [visibleTransactions]
  );

  if (!file) return null;

  function handleSave(draft: TransactionDraft) {
    const updated = editing
      ? updateTransaction(file!, editing.id, draft)
      : createTransaction(file!, draft, crypto.randomUUID());
    setFile(updated);
    setEditing(undefined);
  }

  function handleDelete(transaction: Transaction) {
    if (window.confirm(`Удалить транзакцию от ${transaction.date}?`)) {
      setFile(deleteTransaction(file!, transaction.id));
    }
  }

  const hasAnyTransactions = file.transactions.length > 0;

  return (
    <section className="transactions-tab">
      <div className="transaction-toolbar">
        <div className="transaction-summaries">
          {summaries.map((summary) => (
            <div className="transaction-summary" key={summary.currency}>
              <strong>{summary.currency}</strong>
              <span>Пополнения {amountFormatter.format(summary.deposits)}</span>
              <span>Выводы {amountFormatter.format(summary.withdrawals)}</span>
              <span>Чистый поток {amountFormatter.format(summary.netFlow)}</span>
            </div>
          ))}
        </div>
        <div className="transaction-controls">
          <label>
            Валюта
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as CurrencyFilter)}
            >
              <option value="ALL">Все валюты</option>
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
            </select>
          </label>
          <button type="button" onClick={() => setEditing(null)}>Добавить транзакцию</button>
          <button type="button" onClick={() => setShowAccounts(true)}>Счета</button>
        </div>
      </div>

      {!hasAnyTransactions ? (
        <div className="empty-state transaction-empty">
          <p>Транзакций пока нет.</p>
          <button type="button" onClick={() => setEditing(null)}>Добавить первую транзакцию</button>
        </div>
      ) : visibleTransactions.length === 0 ? (
        <div className="empty-state transaction-empty">Нет транзакций в выбранной валюте.</div>
      ) : (
        <TransactionsList
          transactions={visibleTransactions}
          accounts={file.brokerAccounts}
          onEdit={(transaction) => setEditing(transaction)}
          onDelete={handleDelete}
        />
      )}

      {editing !== undefined && (
        <TransactionFormModal
          transaction={editing}
          accounts={file.brokerAccounts}
          onSave={handleSave}
          onClose={() => setEditing(undefined)}
        />
      )}
      {showAccounts && (
        <BrokerAccountsModal
          file={file}
          onChange={setFile}
          onClose={() => setShowAccounts(false)}
        />
      )}
    </section>
  );
}
