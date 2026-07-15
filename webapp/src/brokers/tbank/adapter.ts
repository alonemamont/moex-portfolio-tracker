import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import { fetchTbankAccounts, fetchTbankPortfolio, resolveTbankTicker, quantityToShares } from "./client";
import { pLimit } from "../../concurrency/pLimit";
import { logBrokerSyncInfo, logBrokerSyncWarn } from "../diagnostics";

export const tbankAdapter: BrokerAdapter = {
  id: "tbank",
  label: "Т-Банк",

  async listAccounts(token: string): Promise<BrokerAccount[]> {
    const accounts = await fetchTbankAccounts(token);
    logBrokerSyncInfo("tbank.accounts.loaded", { count: accounts.length });
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  },

  async fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]> {
    const positions = await fetchTbankPortfolio(token, accountId);
    const shares = positions.filter((p) => p.instrumentType === "share");
    logBrokerSyncInfo("tbank.portfolio.loaded", {
      accountId,
      positions: positions.length,
      sharePositions: shares.length,
    });
    const limit = pLimit(5);
    const resolved = await Promise.all(
      shares.map((position) =>
        limit(async () => {
          const ticker = await resolveTbankTicker(token, position.instrumentUid);
          return ticker ? { ticker, shares: quantityToShares(position.quantity) } : null;
        })
      )
    );
    const unresolvedCount = resolved.filter((holding) => holding === null).length;
    if (unresolvedCount > 0) {
      logBrokerSyncWarn("tbank.portfolio.unresolvedTickers", {
        accountId,
        unresolvedCount,
      });
    }
    const holdings = resolved.filter((h): h is BrokerHoldingRaw => h !== null);
    logBrokerSyncInfo("tbank.portfolio.holdingsReady", {
      accountId,
      holdings: holdings.length,
    });
    return holdings;
  },
};
