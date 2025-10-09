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
  "just",
  "like",
  "kind of",
  "sort of",
];

const FRACTION_SYNONYMS: Record<string, string> = {
  "1/2": "0.5",
  "50%": "0.5",
  "1/4": "0.25",
  "25%": "0.25",
  "1/3": "0.3333",
  "33%": "0.3333",
  "33.33%": "0.3333",
  "75%": "0.75",
  "3/4": "0.75",
  "66%": "0.6666",
  "66.66%": "0.6666",
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

const DIRECTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\binto\b/gi, " to "],
  [/\bonto\b/gi, " to "],
  [/\bin to\b/gi, " to "],
  [/\btowards\b/gi, " to "],
  [/\bfor\b/gi, " to " ],
];

const MULTIWORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/swap\s+all/gi, "swap max"],
  [/swap\s+everything/gi, "swap max"],
  [/wrap\s+all/gi, "wrap max"],
  [/unwrap\s+all/gi, "unwrap max"],
];

const SPACE_REGEX = /\s+/g;
const EURO_LOCALE_NUMBER = /\b\d{1,3}(?:\.\d{3})+,\d+\b/g;

export const normalizeUtterance = (input: string): NormalizedUtterance => {
  let normalized = input.trim();

  for (const [pattern, replacement] of MULTIWORD_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(EURO_LOCALE_NUMBER, (match) => match.replace(/\./g, "").replace(",", "."));

  const fillerPattern = new RegExp(`\\b(${FILLER_WORDS.join("|")})\\b`, "gi");
  normalized = normalized.replace(fillerPattern, " ");

  for (const [pattern, replacement] of DIRECTION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

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
