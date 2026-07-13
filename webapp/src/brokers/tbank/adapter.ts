import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";
import { pLimit } from "../../concurrency/pLimit";

export const tbankAdapter: BrokerAdapter = {
  id: "tbank",
  label: "Т-Банк",

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
