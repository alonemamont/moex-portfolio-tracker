import { BrokerAccount, Transaction } from "../types";

const amountFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TransactionsList({
  transactions,
  accounts,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  accounts: BrokerAccount[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  return (
    <div className="transactions-list">
      <table className="transactions-table">
        <thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Счёт</th><th>Комментарий</th><th>Действия</th></tr></thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td data-label="Дата">{transaction.date}</td>
              <td data-label="Тип">{transaction.type === "deposit" ? "Пополнение" : "Вывод"}</td>
              <td data-label="Сумма" className="num">{amountFormatter.format(transaction.amount)} {transaction.currency}</td>
              <td data-label="Счёт">{transaction.accountId ? accountNames.get(transaction.accountId) : "Общий портфель"}</td>
              <td data-label="Комментарий">{transaction.comment ?? "—"}</td>
              <td data-label="Действия" className="transaction-actions">
                <button type="button" onClick={() => onEdit(transaction)}>Изменить</button>
                <button type="button" onClick={() => onDelete(transaction)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
