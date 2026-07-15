import { z } from "zod";
import { getTbankTransport, HttpTransport } from "../../http/transport";

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

export type TbankClientErrorCode = "auth" | "rate-limit" | "unavailable" | "contract";

export class TbankClientError extends Error {
  constructor(
    public readonly code: TbankClientErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TbankClientError";
  }
}

function httpError(status: number): TbankClientError {
  if (status === 401 || status === 403) {
    return new TbankClientError("auth", "Неверный токен или недостаточно прав");
  }
  if (status === 429) {
    return new TbankClientError("rate-limit", "Превышен лимит запросов Т-Банка");
  }
  return new TbankClientError("unavailable", "API Т-Банка временно недоступен");
}

async function tbankRequest<T>(
  token: string,
  service: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
  transport: HttpTransport
): Promise<T> {
  let response: Response;

  try {
    response = await transport(`${TBANK_API_BASE}.${service}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TbankClientError("unavailable", "API Т-Банка временно недоступен");
  }

  if (!response.ok) {
    throw httpError(response.status);
  }

  try {
    return schema.parse(await response.json());
  } catch {
    throw new TbankClientError("contract", "Ответ Т-Банка имеет несовместимый формат");
  }
}

const accountSchema = z.object({ id: z.string(), name: z.string() });
const quantitySchema = z.object({ units: z.string(), nano: z.number() });
const positionSchema = z.object({
  figi: z.string(),
  instrumentType: z.string(),
  instrumentUid: z.string(),
  quantity: quantitySchema,
});

export async function fetchTbankAccounts(
  token: string,
  transport: HttpTransport = getTbankTransport()
): Promise<TbankAccount[]> {
  const result = await tbankRequest(
    token,
    "UsersService",
    "GetAccounts",
    {},
    z.object({ accounts: z.array(accountSchema) }),
    transport
  );
  return result.accounts;
}

export async function fetchTbankPortfolio(
  token: string,
  accountId: string,
  transport: HttpTransport = getTbankTransport()
): Promise<TbankPortfolioPosition[]> {
  const result = await tbankRequest(
    token,
    "OperationsService",
    "GetPortfolio",
    { accountId, currency: "RUB" },
    z.object({ positions: z.array(positionSchema) }),
    transport
  );
  return result.positions;
}

export async function resolveTbankTicker(
  token: string,
  instrumentUid: string,
  transport: HttpTransport = getTbankTransport()
): Promise<string | null> {
  try {
    const result = await tbankRequest(
      token,
      "InstrumentsService",
      "GetInstrumentBy",
      { idType: "INSTRUMENT_ID_TYPE_UID", id: instrumentUid },
      z.object({ instrument: z.object({ ticker: z.string() }) }),
      transport
    );
    return result.instrument.ticker;
  } catch {
    return null;
  }
}

export function quantityToShares(quantity: TbankQuantity): number {
  return Number(quantity.units) + quantity.nano / 1e9;
}
