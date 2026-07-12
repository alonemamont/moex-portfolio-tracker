export interface IndexOption {
  id: string;
  label: string;
}

export const INDEX_OPTIONS: IndexOption[] = [
  { id: "IMOEX", label: "IMOEX" },
  { id: "MOEXBC", label: "MOEXBC" },
  { id: "MOEX10", label: "MOEX10" },
];

export const DEFAULT_INDEX_ID = "IMOEX";
