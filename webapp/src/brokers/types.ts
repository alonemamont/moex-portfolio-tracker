export interface BrokerAccount {
  id: string;
  name: string;
}

export interface BrokerHoldingRaw {
  ticker: string;
  shares: number;
}

export interface BrokerAdapter {
  id: string;
  label: string;
  /**
   * Shown appended to the connection-error message when the fetch fails at the
   * network/TLS layer (a TypeError, not an HTTP-status rejection from the broker).
   */
  networkErrorHint?: string;
  listAccounts(token: string): Promise<BrokerAccount[]>;
  fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]>;
}
