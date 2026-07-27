import { BrokerAdapter } from "./types";
import { tbankAdapter } from "./tbank/adapter";
import { finamAdapter } from "./finam/adapter";

export const BROKER_REGISTRY: BrokerAdapter[] = [tbankAdapter, finamAdapter];

export function getBrokerAdapter(brokerId: string): BrokerAdapter | undefined {
  return BROKER_REGISTRY.find((adapter) => adapter.id === brokerId);
}
