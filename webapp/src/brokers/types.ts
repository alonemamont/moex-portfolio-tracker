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
  listAccounts(token: string): Promise<BrokerAccount[]>;
  fetchHoldings(token: string, accountId: string): Promise<BrokerHoldingRaw[]>;
}
