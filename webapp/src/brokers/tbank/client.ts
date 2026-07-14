const TBANK_API_BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";

export interface TbankAccount {
  id: string;
  name: string;
}

export interface TbankQuantity {
  units: string;
  nano: number;
}

export interface TbankPortfolioPosition {
  figi: string;
  instrumentType: string;
  instrumentUid: string;
  quantity: TbankQuantity;
}

async function tbankRequest<T>(token: string, service: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`${TBANK_API_BASE}.${service}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`T-Invest API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchTbankAccounts(token: string): Promise<TbankAccount[]> {
  const result = await tbankRequest<{ accounts: TbankAccount[] }>(token, "UsersService", "GetAccounts", {});
  return result.accounts;
}

export async function fetchTbankPortfolio(token: string, accountId: string): Promise<TbankPortfolioPosition[]> {
  const result = await tbankRequest<{ positions: TbankPortfolioPosition[] }>(
    token,
    "OperationsService",
    "GetPortfolio",
    { accountId, currency: "RUB" }
  );
  return result.positions;
}

export async function resolveTbankTicker(token: string, instrumentUid: string): Promise<string | null> {
  try {
    const result = await tbankRequest<{ instrument: { ticker: string } }>(
      token,
      "InstrumentsService",
      "GetInstrumentBy",
      { idType: "INSTRUMENT_ID_TYPE_UID", id: instrumentUid }
    );
    return result.instrument.ticker;
  } catch {
    return null;
  }
}

export function quantityToShares(quantity: TbankQuantity): number {
  return Number(quantity.units) + quantity.nano / 1e9;
}
