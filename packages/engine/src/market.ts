/**
 * Merchant pricing. Merchants pay half an item's value, but big batches
 * flood the market, so the rate per item drops in tiers: the first 20
 * sell at the full rate, the next 80 at half that, and the rest at a
 * quarter. A sale of anything with value always pays at least 1 gold, so
 * a stack of cheap materials is never sold for nothing.
 */
const SELL_RATE = 0.5;
const SELL_TIERS: Array<{ upTo: number; rate: number }> = [
  { upTo: 20, rate: 1 },
  { upTo: 100, rate: 0.5 },
  { upTo: Infinity, rate: 0.25 }
];

/** Gold a merchant pays for `qty` items worth `value` each. 0 only when `value` or `qty` is 0. */
export function sellValue(value: number, qty: number): number {
  if (value <= 0 || qty <= 0) return 0;
  let units = 0;
  let from = 0;
  for (const tier of SELL_TIERS) {
    if (qty <= from) break;
    units += (Math.min(qty, tier.upTo) - from) * tier.rate;
    from = tier.upTo;
  }
  return Math.max(1, Math.floor(value * SELL_RATE * units));
}
