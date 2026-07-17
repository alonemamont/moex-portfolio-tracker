import { isTauriRuntime } from "../runtime/isTauriRuntime";

export type HttpTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const browserTransport: HttpTransport = (input, init) => globalThis.fetch(input, init);

export const tauriTransport: HttpTransport = async (input, init) => {
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch(input, init);
};

export function getHttpTransport(): HttpTransport {
  return isTauriRuntime() ? tauriTransport : browserTransport;
}
