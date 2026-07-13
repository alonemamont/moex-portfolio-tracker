import { describe, it, expect, beforeEach } from "vitest";
import { getSessionToken, setSessionToken, clearSessionToken } from "./tokenSession";

beforeEach(() => {
  sessionStorage.clear();
});

describe("tokenSession", () => {
  it("returns null when no token is cached for a connection", () => {
    expect(getSessionToken("conn-1")).toBeNull();
  });

  it("stores and retrieves a token by connection id", () => {
    setSessionToken("conn-1", "decrypted-token");
    expect(getSessionToken("conn-1")).toBe("decrypted-token");
  });

  it("keeps tokens for different connections separate", () => {
    setSessionToken("conn-1", "token-1");
    setSessionToken("conn-2", "token-2");
    expect(getSessionToken("conn-1")).toBe("token-1");
    expect(getSessionToken("conn-2")).toBe("token-2");
  });

  it("removes a token on clear", () => {
    setSessionToken("conn-1", "token-1");
    clearSessionToken("conn-1");
    expect(getSessionToken("conn-1")).toBeNull();
  });
});
