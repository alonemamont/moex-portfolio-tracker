import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";
import { pLimit } from "../../concurrency/pLimit";

export const tbankAdapter: BrokerAdapter = {
  id: "tbank",
  label: "Т-Банк",

  networkErrorHint:
    "T-Invest API (invest-public-api.tbank.ru) отдаёт сертификат, подписанный Russian Trusted Sub CA — " +
    "этой цепочки обычно нет в хранилище браузера, из-за чего соединение рвётся с сетевой ошибкой ещё до " +
    "ответа брокера. На странице https://www.gosuslugi.ru/crt нужна именно пара «Russian Trusted Root CA» " +
    "+ «Russian Trusted Sub CA» (не «Минцифры России ГУЦ/НУЦ» — это другой сертификат для других целей). " +
    "Root CA — в хранилище «Доверенные корневые центры сертификации», Sub CA — в «Промежуточные центры " +
    "сертификации», затем полностью перезапустите браузер.",

  async listAccounts(token: string): Promise<BrokerAccount[]> {
    const accounts = await fetchTbankAccounts(token);
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  },

  async fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]> {
    const positions = await fetchTbankPortfolio(token, accountId);
    const shares = positions.filter((p) => p.instrumentType === "share");
    const limit = pLimit(5);
    const resolved = await Promise.all(
      shares.map((position) =>
        limit(async () => {
          const ticker = await resolveTbankTicker(token, position.instrumentUid);
          return ticker ? { ticker, shares: quantityToShares(position.quantity) } : null;
        })
      )
    );
    return resolved.filter((h): h is BrokerHoldingRaw => h !== null);
  },
};
