import { vi } from "vitest";

export interface FetchRoute {
  match: string | RegExp;
  response: () => Response;
}

export function mockFetchByUrl(routes: FetchRoute[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const route = routes.find(({ match }) =>
        typeof match === "string" ? url.includes(match) : match.test(url)
      );
      if (!route) {
        throw new Error(`no mockFetchByUrl route matches URL: ${url}`);
      }
      return route.response();
    })
  );
}

export function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    })
  );
}
