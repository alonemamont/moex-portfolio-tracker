import { BrokerAdapter, BrokerAccount, BrokerHoldingRaw } from "../types";
import {
  exchangeFinamSecret,
  fetchFinamAccountIds,
  fetchFinamAccountDetails,
  resolveFinamAsset,
  parseFinamQuantity,
} from "./client";
import { pLimit } from "../../concurrency/pLimit";

export const finamAdapter: BrokerAdapter = {
  id: "finam",
  label: "Финам",

  async listAccounts(secret: string): Promise<BrokerAccount[]> {
    const jwt = await exchangeFinamSecret(secret);
    const accountIds = await fetchFinamAccountIds(jwt);
    return accountIds.map((id) => ({ id, name: id }));
  },

  async fetchHoldings(secret: string, accountId: string): Promise<BrokerHoldingRaw[]> {
    const jwt = await exchangeFinamSecret(secret);
    const details = await fetchFinamAccountDetails(jwt, accountId);
    const limit = pLimit(5);
    const resolved = await Promise.all(
      details.positions.map((position) =>
        limit(async () => {
          const asset = await resolveFinamAsset(jwt, position.symbol, accountId);
          if (!asset || asset.type !== "EQUITIES") return null;
          return { ticker: asset.ticker, shares: parseFinamQuantity(position.quantity) };
        })
      )
    );
    return resolved.filter((h): h is BrokerHoldingRaw => h !== null);
  },
};
