import { randomInt } from "node:crypto";

// Crockford-ish alphabet minus visually ambiguous characters (0/O, 1/I/L) —
// codes are read off a screen once and typed back later, so ambiguity costs
// a support ticket.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_COUNT = 10;
const GROUP_LENGTH = 5;

function randomCode(): string {
  let group1 = "";
  let group2 = "";
  for (let i = 0; i < GROUP_LENGTH; i++) group1 += ALPHABET[randomInt(ALPHABET.length)];
  for (let i = 0; i < GROUP_LENGTH; i++) group2 += ALPHABET[randomInt(ALPHABET.length)];
  return `${group1}-${group2}`;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: CODE_COUNT }, randomCode);
}

// Recovery codes are typed by hand — normalize case and stray whitespace
// before hashing/comparing so "abcd-efgh" and "ABCD-EFGH" both work.
export function normalizeRecoveryCode(raw: string): string {
  return raw.trim().toUpperCase();
}
