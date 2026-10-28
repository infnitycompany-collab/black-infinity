export const GB = 1_000_000_000;
export const CHUNK = 4 * 1024 * 1024;
export const PLANS = {
  free: { name: "Free", gb: 2, usd: 0, minutes: 15, delivery: 10 },
  plus: { name: "Plus", gb: 20, usd: 2.99, minutes: 120, delivery: 50 },
  pro: { name: "Pro", gb: 100, usd: 6.99, minutes: 300, delivery: 200 },
};
export function level(count: number) {
  return count >= 25
    ? "Infinity Advocate"
    : count >= 10
      ? "Ambassador"
      : count >= 3
        ? "Connector"
        : "Explorer";
}
export function priceEGP(usd: number, settlementRate: number, feeEGP: number) {
  if (
    ![usd, settlementRate, feeEGP].every(Number.isFinite) ||
    usd < 0 ||
    settlementRate <= 0 ||
    feeEGP < 0
  )
    throw new Error("Invalid price inputs");
  return Math.ceil((usd * settlementRate + feeEGP) / 10) * 10;
}
export function contributionMargin(net: number, cost: number) {
  return net > 0 ? (net - cost) / net : 0;
}
export function parseRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) throw new Error("Invalid range");
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1]
    ? m[2]
      ? Math.min(Number(m[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    throw new Error("Unsatisfiable range");
  return { start, end, partial: true };
}
