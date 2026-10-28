/** Digits only; +63 / 63 prefix is treated as a leading 0 (Philippine mobile). */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "")
  if (digits.startsWith("63") && digits.length >= 11) digits = `0${digits.slice(2)}`
  return digits
}

/**
 * Omnichannel match: one query is checked against name, email, mobile and booking id at once.
 * Phone matching only applies when the query has at least 3 digits.
 */
export function matchesGuest(
  query: string,
  fields: { name?: string; email?: string; phone?: string; id?: string; extra?: string[] },
) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const text = [fields.name, fields.email, fields.id, ...(fields.extra ?? [])]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(q))
  if (text) return true
  const qd = normalizePhone(q)
  if (qd.length >= 3 && fields.phone) return normalizePhone(fields.phone).includes(qd)
  return false
}

export const SEARCH_PLACEHOLDER = "Search name, email or mobile"
