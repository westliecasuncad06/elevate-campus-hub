/**
 * Keeps names tidy when someone types them in capitals by accident ("JARDIN" -> "Jardin", "DE LA CRUZ" -> "De La Cruz").
 *
 * Only words typed entirely in capitals are changed. Anything already in normal case is left exactly as typed, so
 * "McDonald", "dela Cruz" and "O'Brien" survive, and so do short all-caps words that are probably initials or
 * nicknames ("JM", "RJ") when they stand in a name that is otherwise written normally.
 * No imports on purpose: scripts load this file directly.
 */

const ROMAN_SUFFIX = /^(II|III|IV|VI|VII|VIII|IX)$/;

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function letterCount(text: string): number {
  return text.replace(/[^\p{L}]/gu, "").length;
}

/** "JARDIN" -> "Jardin", "O'BRIEN" -> "O'Brien", "SANTOS-REYES" -> "Santos-Reyes", "JR." -> "Jr." */
function titleCaseWord(word: string): string {
  return word.toLowerCase().replace(/(^|[-'’.])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

export function formatName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "";

  // The whole field is in capitals ("JARDIN", "DE LA CRUZ"): fix every word, even the short ones ("DE", "LA").
  // A lone short word ("JM") is more likely a nickname than a shouted surname, so it stays.
  const wholeFieldShouting = isAllCaps(name) && letterCount(name) >= 3;

  return name
    .split(" ")
    .map((word) => {
      if (!isAllCaps(word) || ROMAN_SUFFIX.test(word)) return word;
      const letters = letterCount(word);
      if (letters < 2) return word; // a middle initial: "A."
      if (!wholeFieldShouting && letters < 3) return word; // "JM Carlo": leave the nickname alone
      return titleCaseWord(word);
    })
    .join(" ");
}
