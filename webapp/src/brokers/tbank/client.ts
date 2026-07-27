import { z } from "zod";
import { getHttpTransport, HttpTransport } from "../../http/transport";
import { diagnoseTbankPortfolioRequest } from "../../runtime/tbankDesktopDiagnostics";
import { describeDiagnosticError, logBrokerSyncWarn } from "../diagnostics";

const TBANK_API_BASE = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1";
const WINDOWS_UNTRUSTED_ROOT_ERROR = "-2146762487";

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
  constructor(public readonly code: TbankClientErrorCode, message: string) {
    super(message);
    this.name = "TbankClientError";
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

function httpError(status: number, service: string, method: string): TbankClientError {
  if (status === 401 || status === 403) {
    return new TbankClientError("auth", `Неверный токен или недостаточно прав (${service}/${method}): HTTP ${status}`);
  }
  if (status === 429) {
    return new TbankClientError("rate-limit", `Превышен лимит запросов Т-Банка (${service}/${method}): HTTP ${status}`);
  }
  return new TbankClientError("unavailable", `API Т-Банка временно недоступен (${service}/${method}): HTTP ${status}`);
}

async function getDesktopDiagnosticSuffix(
  token: string,
  service: string,
  method: string,
  body: unknown
): Promise<string> {
  if (service !== "OperationsService" || method !== "GetPortfolio") {
    return "";
  }
  if (!body || typeof body !== "object" || !("accountId" in body)) {
    return "";
  }

  const diagnostic = await diagnoseTbankPortfolioRequest(token, String((body as { accountId: unknown }).accountId));
  return diagnostic ? `. Диагностика desktop transport: ${diagnostic}` : "";
}

function buildTransportFailureMessage(
  service: string,
  method: string,
  transportError: unknown,
  diagnosticSuffix: string
): string {
  const details = `${transportError instanceof Error ? transportError.message : String(transportError)}${diagnosticSuffix}`;

  if (
    details.includes(WINDOWS_UNTRUSTED_ROOT_ERROR) ||
    details.includes("Цепочка сертификатов обработана, но обработка прервана на корневом сертификате") ||
    details.includes("отсутствует отношение доверия с поставщиком доверия")
  ) {
    return `Desktop-приложение не доверяет корневому TLS-сертификату для API Т-Банка (${service}/${method}). ${details}`;
  }

  return `API Т-Банка временно недоступен (${service}/${method}): ${details}`;
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
  } catch (error) {
    const diagnosticSuffix = await getDesktopDiagnosticSuffix(token, service, method, body);
    throw new TbankClientError("unavailable", buildTransportFailureMessage(service, method, error, diagnosticSuffix));
  }

  if (!response.ok) {
    throw httpError(response.status, service, method);
  }

  try {
    return schema.parse(await response.json());
  } catch {
    throw new TbankClientError("contract", `Ответ Т-Банка имеет несовместимый формат (${service}/${method})`);
  }
}

export async function fetchTbankAccounts(
  token: string,
  transport: HttpTransport = getHttpTransport()
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
  transport: HttpTransport = getHttpTransport()
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
  transport: HttpTransport = getHttpTransport()
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
  } catch (error) {
    logBrokerSyncWarn("tbank.resolveTicker.failed", {
      instrumentUid,
      error: describeDiagnosticError(error),
    });
    return null;
  }
}

export function quantityToShares(quantity: TbankQuantity): number {
  return Number(quantity.units) + quantity.nano / 1e9;
}
