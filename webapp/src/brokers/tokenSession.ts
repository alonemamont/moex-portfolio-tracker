const PREFIX = "moex-portfolio-tracker:brokerToken:";

export function getSessionToken(connectionId: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + connectionId);
  } catch {
    return null;
  }
}

export function setSessionToken(connectionId: string, token: string): void {
  try {
    sessionStorage.setItem(PREFIX + connectionId, token);
  } catch {
    // Swallow error — persistence is best-effort
  }
}

export function clearSessionToken(connectionId: string): void {
  try {
    sessionStorage.removeItem(PREFIX + connectionId);
  } catch {
    // Swallow error — persistence is best-effort
  }
}
