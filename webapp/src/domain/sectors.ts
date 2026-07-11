export const OTHER_SECTOR = "Другое";

function normalizeKeys(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [ticker, sector] of Object.entries(map)) {
    result[ticker.toUpperCase()] = sector;
  }
  return result;
}

export function createSectorResolver(
  defaults: Record<string, string>,
  overrides: Record<string, string>
): (ticker: string) => string {
  const normalizedDefaults = normalizeKeys(defaults);
  const normalizedOverrides = normalizeKeys(overrides);

  return (ticker: string) => {
    const key = ticker.toUpperCase();
    return normalizedOverrides[key] ?? normalizedDefaults[key] ?? OTHER_SECTOR;
  };
}
