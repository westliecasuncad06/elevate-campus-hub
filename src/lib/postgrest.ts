/**
 * Safe building blocks for the few places a search box feeds a database filter.
 *
 * The app never builds SQL text: every query goes through Supabase's query builder, which sends values separately
 * (so SQL injection isn't possible). The one thing that CAN be misused is the `.or("a.ilike.%x%,b.ilike.%x%")` string,
 * whose commas, brackets and quotes are filter syntax, so a search term is cleaned before it goes into one.
 */

/**
 * A search term that is safe inside an `.or(...)`/`.ilike(...)` filter: letters, digits, spaces and a few name/email
 * characters only, one space at a time, at most `max` characters.
 */
export function searchTerm(input: unknown, max = 60): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @.+'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this a real UUID? Anything that goes into a filter string by id is checked with this first. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
