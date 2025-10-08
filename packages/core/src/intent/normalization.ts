import { NormalizedUtterance } from "./types.js";

const FILLER_WORDS = [
  "please",
  "hey",
  "hi",
  "hello",
  "could",
  "would",
  "can you",
  "could you",
  "would you",
  "kindly",
];

const FRACTION_SYNONYMS: Record<string, string> = {
  "1/2": "0.5",
  "50%": "0.5",
  "1/4": "0.25",
  "25%": "0.25",
  "1/3": "0.3333",
};

const ACTION_SYNONYMS: Record<string, string> = {
  trade: "swap",
  convert: "swap",
  buy: "swap",
  sell: "swap",
  stake: "transfer",
  transfer: "transfer",
  wrap: "wrap",
  unwrap: "unwrap",
};

const MULTIWORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/swap\s+all/gi, "swap max"],
  [/swap\s+everything/gi, "swap max"],
  [/wrap\s+all/gi, "wrap max"],
  [/unwrap\s+all/gi, "unwrap max"],
];

const SPACE_REGEX = /\s+/g;

export const normalizeUtterance = (input: string): NormalizedUtterance => {
  let normalized = input.trim();

  for (const [pattern, replacement] of MULTIWORD_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  const fillerPattern = new RegExp(`\\b(${FILLER_WORDS.join("|")})\\b`, "gi");
  normalized = normalized.replace(fillerPattern, " ");

  Object.entries(FRACTION_SYNONYMS).forEach(([synonym, replacement]) => {
    const pattern = new RegExp(`\\b${synonym.replace(/[-/]/g, "\\$&")}\\b`, "gi");
    normalized = normalized.replace(pattern, replacement);
  });

  normalized = normalized.replace(/[,]/g, "");
  normalized = normalized.replace(/[^a-zA-Z0-9.%\s]/g, (match) => (match === "." ? match : " "));
  normalized = normalized.replace(SPACE_REGEX, " ").toLowerCase().trim();

  Object.entries(ACTION_SYNONYMS).forEach(([synonym, canonical]) => {
    const pattern = new RegExp(`\\b${synonym}\\b`, "gi");
    normalized = normalized.replace(pattern, canonical);
  });

  const tokens = normalized.split(SPACE_REGEX).filter(Boolean);

  return {
    raw: input,
    normalized,
    tokens,
  };
};
