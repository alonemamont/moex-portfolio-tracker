const FINAM_API_BASE = "https://api.finam.ru";

export interface FinamQuantity {
  value: string;
}

export interface FinamPosition {
  symbol: string;
  quantity: FinamQuantity;
}

export interface FinamAccountDetails {
  account_id: string;
  positions: FinamPosition[];
}

export interface FinamAssetInfo {
  ticker: string;
  type: string;
}

async function finamRequest<T>(
  path: string,
  options: { method?: string; jwt?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${FINAM_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.jwt ? { Authorization: `Bearer ${options.jwt}` } : {}),
      "Content-Type": "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Finam API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function exchangeFinamSecret(secret: string): Promise<string> {
  const result = await finamRequest<{ token: string }>("/v1/sessions", {
    method: "POST",
    body: { secret },
  });
  return result.token;
}

export async function fetchFinamAccountIds(jwt: string): Promise<string[]> {
  const result = await finamRequest<{ account_ids: string[] }>("/v1/sessions/details", {
    method: "POST",
    body: { token: jwt },
  });
  return result.account_ids;
}

export async function fetchFinamAccountDetails(jwt: string, accountId: string): Promise<FinamAccountDetails> {
  return finamRequest<FinamAccountDetails>(`/v1/accounts/${accountId}`, { jwt });
}

export async function resolveFinamAsset(jwt: string, symbol: string, accountId: string): Promise<FinamAssetInfo | null> {
  try {
    return await finamRequest<FinamAssetInfo>(
      `/v1/assets/${encodeURIComponent(symbol)}?account_id=${encodeURIComponent(accountId)}`,
      { jwt }
    );
  } catch {
    return null;
  }
}

export function parseFinamQuantity(quantity: FinamQuantity): number {
  return Number(quantity.value);
}
