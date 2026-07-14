import { describe, it, expect, afterEach, vi } from "vitest";
import { mockFetchByUrl, mockFetchOnce } from "./mockFetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mockFetchByUrl", () => {
  it("routes to the response whose match is found in the URL", async () => {
    mockFetchByUrl([
      { match: "/securities.xml", response: () => new Response("securities-body", { status: 200 }) },
      { match: "/analytics/", response: () => new Response("analytics-body", { status: 200 }) },
    ]);

    const securitiesRes = await fetch("https://iss.moex.com/iss/.../securities.xml?x=1");
    const analyticsRes = await fetch("https://iss.moex.com/iss/.../analytics/IMOEX.xml");

    expect(await securitiesRes.text()).toBe("securities-body");
    expect(await analyticsRes.text()).toBe("analytics-body");
  });

  it("throws a descriptive error when no route matches", async () => {
    mockFetchByUrl([{ match: "/known", response: () => new Response("", { status: 200 }) }]);
    await expect(fetch("https://example.com/unknown")).rejects.toThrow(/no mockFetchByUrl route matches/);
  });

  it("supports RegExp matchers", async () => {
    mockFetchByUrl([{ match: /\/BROKEN\//, response: () => new Response("", { status: 500 }) }]);
    const res = await fetch("https://example.com/x/BROKEN/y");
    expect(res.status).toBe(500);
  });
});

describe("mockFetchOnce", () => {
  it("resolves fetch with the given JSON body and ok/status", async () => {
    mockFetchOnce({ token: "jwt-abc" });
    const res = await fetch("https://example.com/anything");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "jwt-abc" });
  });

  it("supports a non-ok status", async () => {
    mockFetchOnce({}, false, 401);
    const res = await fetch("https://example.com/anything");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });
});
