const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "coin",
  "crypto",
  "for",
  "from",
  "fun",
  "in",
  "is",
  "meme",
  "new",
  "of",
  "on",
  "pump",
  "sol",
  "solana",
  "the",
  "to",
  "token",
  "with"
]);

const GENERIC_TOKEN_WORDS = new Set([
  "baby",
  "based",
  "cat",
  "coin",
  "crypto",
  "dog",
  "elon",
  "inu",
  "meme",
  "moon",
  "pepe",
  "pump",
  "rocket",
  "sol",
  "token"
]);

export function normalizePhrase(value: string): string {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactPhrase(value: string): string {
  return normalizePhrase(value).replace(/\s+/g, "");
}

export function tokenize(value: string): string[] {
  return normalizePhrase(value)
    .split(" ")
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

export function contentTokens(value: string): string[] {
  return tokenize(value).filter((token) => !GENERIC_TOKEN_WORDS.has(token));
}

export function consonantSkeleton(value: string): string {
  return compactPhrase(value).replace(/[aeiou]/g, "");
}

export function slugify(value: string): string {
  return normalizePhrase(value).replace(/\s+/g, "-").slice(0, 96) || "unknown";
}

export function acronym(value: string): string {
  return tokenize(value)
    .map((token) => token[0])
    .join("");
}

export function similarity(a: string, b: string): number {
  const left = compactPhrase(a);
  const right = compactPhrase(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export function generateAliases(phrase: string): string[] {
  const normalized = normalizePhrase(phrase);
  const tokens = tokenize(normalized);
  const aliases = new Set<string>([normalized, compactPhrase(normalized)]);
  if (tokens.length > 0) aliases.add(tokens[0]);
  if (tokens.length > 1) aliases.add(tokens.slice(0, 2).join(" "));
  const initials = acronym(normalized);
  if (initials.length >= 2) aliases.add(initials);
  for (const token of tokens) {
    if (token.length >= 4) aliases.add(token);
    if (token.endsWith("s") && token.length > 4) aliases.add(token.slice(0, -1));
  }
  return [...aliases].filter((alias) => alias.length >= 2);
}

export function isGenericOnly(value: string): boolean {
  const tokens = tokenize(value);
  return tokens.length > 0 && tokens.every((token) => GENERIC_TOKEN_WORDS.has(token));
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
