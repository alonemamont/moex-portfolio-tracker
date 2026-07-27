import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("desktop TLS configuration", () => {
  it("uses Windows native TLS for Tauri HTTP", () => {
    const cargoTomlPath = path.resolve(import.meta.dirname, "..", "..", "src-tauri", "Cargo.toml");
    const cargoToml = readFileSync(cargoTomlPath, "utf8");

    expect(cargoToml).toContain("tauri-plugin-http");
    expect(cargoToml).toContain("native-tls");
  });
});
