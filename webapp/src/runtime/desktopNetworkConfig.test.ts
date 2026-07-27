import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function readJson(relativePath: string): any {
  const filePath = path.resolve(import.meta.dirname, "..", "..", relativePath);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("desktop network configuration", () => {
  it("allows both T-Bank API and MOEX ISS requests in Tauri", () => {
    const tauriConfig = readJson("src-tauri/tauri.conf.json");
    const capability = readJson("src-tauri/capabilities/default.json");

    expect(tauriConfig.app.security.csp).toContain("https://invest-public-api.tbank.ru");
    expect(tauriConfig.app.security.csp).toContain("https://iss.moex.com");

    const httpPermission = capability.permissions.find(
      (permission: unknown) => typeof permission === "object" && permission !== null && "identifier" in permission
    ) as { identifier: string; allow?: Array<{ url: string }> } | undefined;

    expect(httpPermission?.identifier).toBe("http:default");
    expect(httpPermission?.allow?.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "https://invest-public-api.tbank.ru/**",
        "https://iss.moex.com/**",
      ])
    );
  });
});
