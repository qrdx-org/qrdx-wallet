/**
 * Node amounts in plain decimal form. The node writes its amounts with Python's `str(Decimal)`,
 * which uses exponent notation for some values: "0E-18" for a balance spent to zero at 18
 * places, "1E+6" for a normalised million. `BigInt()` refuses those, so every parse of an
 * amount that may come from the node goes through here first.
 */

const EXPONENT = /^([+-]?)(\d*)(?:\.(\d*))?[eE]([+-]?\d+)$/

/** "0E-18" → "0", "1E+6" → "1000000", "1.5E-7" → "0.00000015". Anything else is returned trimmed. */
export function plainDecimal(value: string | number): string {
  const s = String(value).trim()
  const m = EXPONENT.exec(s)
  if (!m || (m[2] === '' && !m[3])) return s
  const [, sign, whole, frac = '', exp] = m
  const digits = whole + frac
  const point = whole.length + Number(exp)
  const raw =
    point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`
  const [int, fraction = ''] = raw.split('.')
  const i = int.replace(/^0+(?=\d)/, '') || '0'
  const f = fraction.replace(/0+$/, '')
  const out = f ? `${i}.${f}` : i
  return sign === '-' && /[1-9]/.test(out) ? `-${out}` : out
}
