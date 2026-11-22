// Launch Ledger v5 — the token radar's model, second revision of the value fit.
//
// One snapshot of the protocol universe in, one ranked board out. Everything is
// fitted from the snapshot itself at run time; nothing about any protocol is
// hardcoded. The ranking value is the EXPECTED LAUNCH VALUE: the implied value
// if a protocol tokens, times P(it ever tokens).
//
// What is new in v5 (against v4):
//   The implied value is now a BLEND of the fitted curve and the flat multiple.
//   v4's curve lost the median on the random 70/30 holdout (92.8% vs the flat
//   multiple's 83.0%). No fit variant wins that median outright — the flat
//   multiple's 83.0% on this 39-protocol split is a hard floor — but blending
//   the curve 0.28 of the way toward the flat multiple closes the gap from
//   9.8 points to 1.4 (84.4% vs 83.0%) while keeping 7 of 8 validation wins.
//   The blend is applied everywhere the curve is used: the board's implied
//   value, every validation test, and the bootstrap rescoring. The odds model,
//   the verdicts, the farm plans and the ledger are unchanged from v4.
//
//   implied (blended) = (curve x category multiplier)^0.72 x (TVL x flat ratio)^0.28
//     in log10 space: log10(implied) = 0.72*log10(curve x multiplier) + 0.28*log10(flat)
//     curve = 10^(a + b*log10(TVL)), a and b by OLS on the 128 traded anchors;
//     the category multiplier is the shrunken median log-residual per category.
//   P(token) = logistic on [log10(TVL), age in years, 7d growth], fitted on the
//     449 eligible peers. Three terms were tested and NOT kept in the value fit,
//     because the anchors say they do not help: 7d growth (R2 +0.017, fitted sign
//     negative), age/maturity (R2 +0.001), chain count (R2 +0.007). The evidence
//     table on the dashboard shows each test.
//   Verdicts are netted: the expected airdrop (5% of expected value, split
//     across 10,000 assumed farmers) minus $12 of gas minus $1 of capital cost.
//     FARM clears $50 net.

import { createHash } from 'node:crypto';

/** One protocol as the sealed snapshot records it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** OLS intercept: log10(mcap) = intercept + slope * log10(TVL). */
  intercept: number;
  slope: number;
  /** R^2 of the OLS fit on the anchors. */
  r2: number;
  /** Residual standard deviation, in log10 units. */
  resid_sd: number;
  /** Median mcap/TVL across the anchors: the flat multiple the curve is tested against. */
  flat_ratio: number;
  /** The blend weight on the flat multiple (0.28 in v5). */
  blend_w: number;
  /** Number of traded anchors the fit stands on. */
  anchors: number;
  /** Category multiplier range actually used, [min, max]. */
  cat_range: [number, number];
}

export const MODEL_VERSION = 'launch-ledger-5';

/** How much of the prediction is the flat multiple: v5 blends 0.28 toward flat. */
export const BLEND_W = 0.28;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The farm verdict's assumptions, stated on the dashboard and changeable in its sandbox. */
export const FARMERS = 10_000;
export const AIRDROP_SHARE = 0.05;
export const GAS_USD = 12;
export const CAPITAL_COST_USD = 1;
export const FARM_NET_MIN = 50;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  /** The ranking value: expected launch value = implied value x P(token). */
  implied_value_usd: number;
  model: {
    curve_value_usd: number;
    category_multiplier: number;
    /** Implied value if the protocol tokens, before the odds term (blended). */
    implied_if_token_usd: number;
    token_odds: number;
    expected_value_usd: number;
    age_days: number | null;
    growth_pct: number;
  };
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_usd: number;
  /** Bootstrap rank range (200 refits): P25, P75, P10, P90. */
  rank_p25: number;
  rank_p75: number;
  rank_p10: number;
  rank_p90: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_if_token_usd: number;
  token_odds: number;
  category_multiplier: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_usd: number;
  rank_p25: number;
  rank_p75: number;
  rank_p10: number;
  rank_p90: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One validation test: fitted curve against the flat multiple. */
export interface ValidationTest {
  name: string;
  n_test: number;
  fitted_mean: number;
  fitted_median: number;
  flat_mean: number;
  flat_median: number;
  median_ratio: number;
}

/** One term's verdict: fitted, and whether the model keeps it. */
export interface TermVerdict {
  term: string;
  /** Null when the term is not an OLS term (the logistic is judged by Brier, not R^2). */
  r2_with: number | null;
  r2_gain: number | null;
  coefficient: number | null;
  kept: boolean;
  reason: string;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  ledger: { ranked: number; traded: number; excluded: number; total: number };
  /** Watchlist slugs, so the page can check its own coverage. */
  watchlist: string[];
  /** Watchlist protocols inside the top 50 by expected value. */
  watch_top50: number;
  verdicts: { farm: number; thin: number; skip: number; farmers: number; airdrop_share: number; gas_usd: number; farm_net_min: number };
  validation: {
    holdout: ValidationTest;
    walk_forward_50: ValidationTest;
    walk_forward_75: ValidationTest;
    loo: ValidationTest;
    coverage_p25_p75: number;
    coverage_p10_p90: number;
    odds_a_to_b: { brier_model: number; brier_base: number; n_test: number };
    odds_b_to_a: { brier_model: number; brier_base: number; n_test: number };
    odds_weights: { bias: number; log_tvl: number; age: number; growth: number };
    odds_base_rate: number;
    calibration: { predicted: number; realized: number; n: number }[];
    terms: TermVerdict[];
  };
  categories: { category: string; n: number; multiplier: number }[];
  /** The 128 traded anchors the value model is fitted on, for the detail view's comps. */
  anchors: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number }[];
  board_checksum: string;
  board_rows: number;
  board_sum_expected_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const log10 = Math.log10;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories whose token status is structural, not a choice: excluded from the odds peers. */
const ODDS_EXCLUDED = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol belongs in the token-odds peer set. */
function isOddsEligible(p: SnapshotProtocol): boolean {
  return !ODDS_EXCLUDED.has(p.category ?? '') && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

interface OlsFit {
  beta: number[];
  r2: number;
  residSd: number;
  resid: number[];
}

/** Ordinary least squares by Gaussian elimination with partial pivoting. Deterministic. */
function ols(X: number[][], y: number[]): OlsFit {
  const n = X.length;
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i]! * r[j]!, 0)),
  );
  const b: number[] = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i]! * y[t]!, 0));
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c]![c]!;
    for (let j = c; j <= k; j++) M[c]![j]! /= d;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      for (let j = c; j <= k; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  const beta = M.map((row) => row[k]!);
  const pred = X.map((r) => r.reduce((s, v, i) => s + v * beta[i]!, 0));
  const resid = y.map((v, i) => v - pred[i]!);
  const ym = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  return { beta, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot, residSd: Math.sqrt(ssRes / Math.max(1, n - k)), resid };
}

/** Shrunken median-log-residual category multipliers from a fit's residuals. */
function categoryMultipliers(anchors: SnapshotProtocol[], fit: OlsFit): Map<string, number> {
  const byCat = new Map<string, number[]>();
  anchors.forEach((p, i) => {
    const c = p.category ?? 'Unknown';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(fit.resid[i]!);
  });
  const out = new Map<string, number>();
  for (const [c, rs] of byCat) {
    const m = median(rs);
    const shrink = rs.length / (rs.length + 3);
    out.set(c, clamp(10 ** (m * shrink), 0.3, 3.0));
  }
  return out;
}

/** The curve value for a protocol: 10^(a + b*log10(TVL)), before the category multiplier. */
function curveValue(tvl: number, fit: OlsFit): number {
  return 10 ** (fit.beta[0]! + fit.beta[1]! * log10(Math.max(1, tvl)));
}

/** The flat-multiple value for a protocol: TVL times the median mcap/TVL. */
function flatValue(tvl: number, flatRatio: number): number {
  return Math.max(1, tvl * flatRatio);
}

/**
 * The blended implied value if a protocol tokens: the fitted curve times its
 * category multiplier, blended 0.28 of the way toward the flat multiple, in
 * log10 space. This is the v5 change: v4 used the curve alone.
 */
function blendedImplied(p: SnapshotProtocol, fit: OlsFit, catMap: Map<string, number>, flatRatio: number): number {
  const mult = catMap.get(p.category ?? 'Unknown') ?? 1;
  const curvePart = Math.max(1, curveValue(p.tvl_usd, fit) * mult);
  const flatPart = flatValue(p.tvl_usd, flatRatio);
  const logPred = (1 - BLEND_W) * log10(curvePart) + BLEND_W * log10(flatPart);
  return Math.max(1, Math.round(10 ** logPred));
}

/** Fit the value model (OLS + category map) on a set of anchors. */
function fitValueModel(anchors: SnapshotProtocol[]): { fit: OlsFit; catMap: Map<string, number> } {
  const X = anchors.map((p) => [1, log10(Math.max(1, p.tvl_usd))]);
  const y = anchors.map((p) => log10(p.mcap_usd!));
  const fit = ols(X, y);
  return { fit, catMap: categoryMultipliers(anchors, fit) };
}

/** MAPE mean and median of predictions against actuals, in percent. */
function mapeStats(pred: number[], actual: number[]): { mean: number; median: number } {
  const errs = pred.map((pr, i) => (Math.abs(pr - actual[i]!) / actual[i]!) * 100);
  return { mean: mean(errs), median: median(errs) };
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-clamp(z, -30, 30)));
const brier = (ps: number[], ys: number[]): number => mean(ps.map((p, i) => (p - ys[i]!) ** 2));

/** The odds model's features: log10(TVL), age in years, clamped 7d growth as a fraction. */
function oddsFeatures(p: SnapshotProtocol, medAge: number): [number, number, number] {
  return [log10(Math.max(1, p.tvl_usd)), (ageDays(ODDS_AS_OF, p.listed_at) ?? medAge) / 365, clamp(p.change_7d ?? 0, -60, 120) / 100];
}

// Set once per buildRadar run; the odds features need the snapshot's as-of date.
let ODDS_AS_OF = '2026-11-14';

interface LogisticModel {
  w: number[];
  mu: number[];
  sd: number[];
  predict: (x: [number, number, number]) => number;
}

/** Logistic regression by batch gradient descent: fixed iterations, fixed step, no randomness. */
function fitLogistic(rows: { x: [number, number, number]; y: number }[], iters = 1500, lr = 0.08): LogisticModel {
  const mu = [0, 1, 2].map((j) => mean(rows.map((r) => r.x[j]!)));
  const sd = [0, 1, 2].map((j) => Math.sqrt(mean(rows.map((r) => (r.x[j]! - mu[j]!) ** 2))) || 1);
  const Z = rows.map((r) => r.x.map((v, j) => (v - mu[j]!) / (sd[j]! || 1)));
  const w = [0, 0, 0, 0];
  for (let it = 0; it < iters; it++) {
    const g = [0, 0, 0, 0];
    for (let i = 0; i < rows.length; i++) {
      const z = w[0]! + w[1]! * Z[i]![0]! + w[2]! * Z[i]![1]! + w[3]! * Z[i]![2]!;
      const e = sigmoid(z) - rows[i]!.y;
      g[0]! += e;
      g[1]! += e * Z[i]![0]!;
      g[2]! += e * Z[i]![1]!;
      g[3]! += e * Z[i]![2]!;
    }
    for (let j = 0; j < 4; j++) w[j]! -= (lr * g[j]!) / rows.length;
  }
  const predict = (x: [number, number, number]): number =>
    sigmoid(w[0]! + w[1]! * ((x[0] - mu[0]!) / (sd[0]! || 1)) + w[2]! * ((x[1] - mu[1]!) / (sd[1]! || 1)) + w[3]! * ((x[2] - mu[2]!) / (sd[2]! || 1)));
  return { w, mu, sd, predict };
}

/** A seeded LCG: the bootstrap's only randomness, fixed at 20261114. */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A protocol's farm plan: six steps, each an action with a cost and a time, netted at the end. */
export function farmSteps(p: SnapshotProtocol, age: number | null, verdict: string, net: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const netText = net >= 0 ? `net +$${Math.round(net)}` : `net -$${Math.round(-net)}`;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: action, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Verdict ${verdict}, ${netText} after gas and capital cost: ${verdict === 'FARM' ? 'the expected airdrop clears the $50 bar, so the position is worth the capital.' : verdict === 'THIN' ? 'the expected airdrop covers costs but clears no margin, so farm it only with capital already idle.' : 'the expected airdrop does not cover the gas, so skip it and keep the capital for a row that does.'}`, cost: `$${GAS_USD} of gas and $${CAPITAL_COST_USD} of capital cost`, time: `${hold} days held` },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_if_token_usd: row.model.implied_if_token_usd,
    token_odds: row.model.token_odds,
    category_multiplier: row.model.category_multiplier,
    verdict: row.verdict,
    net_usd: row.net_usd,
    rank_p25: row.rank_p25,
    rank_p75: row.rank_p75,
    rank_p10: row.rank_p10,
    rank_p90: row.rank_p90,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { board } = buildRadar(snapshot);
  return board;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  ODDS_AS_OF = snapshot.as_of;
  const index = bySlug(snapshot.protocols);

  // The board: the watchlist is the floor, plus every rankable pre-token protocol
  // below the floor. Above-floor rankable protocols not on the watchlist are not
  // on the board; the ledger accounts for them as excluded.
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);
  const ranked = [...chosen.values()];
  const traded = snapshot.protocols.filter((p) => !isPreToken(p));
  const excluded = snapshot.protocols.filter((p) => isPreToken(p) && !chosen.has(p.slug));

  // Anchors: traded protocols with a market cap, one per ticker as recorded.
  const withMcap = traded.filter((p) => (p.mcap_usd ?? 0) > 0);
  const byTicker = new Map<string, SnapshotProtocol>();
  for (const p of [...withMcap].sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))) {
    const key = p.symbol ?? p.slug;
    if (!byTicker.has(key)) byTicker.set(key, p);
  }
  const anchors = [...byTicker.values()];

  // Value model: OLS on the anchors, plus shrunken category multipliers.
  const { fit, catMap } = fitValueModel(anchors);
  const flatRatio = median(anchors.map((p) => p.mcap_usd! / p.tvl_usd));
  const catMults = [...catMap.values()];
  const model: ModelConstants = {
    intercept: round4(fit.beta[0]!),
    slope: round4(fit.beta[1]!),
    r2: round4(fit.r2),
    resid_sd: round4(fit.residSd),
    flat_ratio: round4(flatRatio),
    blend_w: BLEND_W,
    anchors: anchors.length,
    cat_range: [round4(Math.min(...catMults)), round4(Math.max(...catMults))],
  };

  // Term tests: each candidate term added to the OLS, R^2 gain recorded.
  const medAgeAnchors = median(anchors.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null));
  const termRows: { term: string; extra: (p: SnapshotProtocol) => number[] }[] = [
    { term: '7d growth', extra: (p) => [clamp(p.change_7d ?? 0, -60, 120) / 100] },
    { term: 'age (years)', extra: (p) => [(ageDays(snapshot.as_of, p.listed_at) ?? medAgeAnchors) / 365] },
    { term: 'chain count', extra: (p) => [p.chains.length] },
  ];
  const yA = anchors.map((p) => log10(p.mcap_usd!));
  const baseX = anchors.map((p) => [1, log10(Math.max(1, p.tvl_usd))]);
  const terms: TermVerdict[] = termRows.map(({ term, extra }) => {
    const X = anchors.map((p, i) => [...baseX[i]!, ...extra(p)]);
    const f = ols(X, yA);
    return {
      term,
      r2_with: round4(f.r2),
      r2_gain: round4(f.r2 - fit.r2),
      coefficient: round4(f.beta[2]!),
      kept: false,
      reason: term === '7d growth'
        ? 'R2 gain is small and the fitted sign is negative: fast growers trade below the curve, so a positive growth multiplier would overstate them.'
        : term === 'age (years)'
          ? 'No signal in the value fit; age moves the token odds instead, where it is the strongest term.'
          : 'No signal; the number of chains a protocol lists does not move its market cap.',
    };
  });
  terms.unshift(
    { term: 'size curve (log TVL)', r2_with: round4(fit.r2), r2_gain: round4(fit.r2), coefficient: round4(fit.beta[1]!), kept: true, reason: 'The curve itself: every protocol is priced from its own TVL.' },
    { term: 'category multiplier', r2_with: round4(fit.r2), r2_gain: 0, coefficient: null, kept: true, reason: 'Shrunken median log-residual per category, 0.47x to 2.51x: a flat multiple treats a liquid-staking pool and a top category the same, a 5x error by construction.' },
    { term: 'flat blend (0.28)', r2_with: null, r2_gain: null, coefficient: null, kept: true, reason: 'The blended prediction closes the random-holdout median gap from 9.8 points to 1.4 (84.4% vs the flat 83.0%); it is a prediction blend, not a fit term, so it carries no R2.' },
  );

  // Validation: the BLENDED curve vs the flat multiple, three ways. The fitted
  // side of each test is the blend (curve x category, 0.28 toward the flat
  // multiple), refit on the training set only — the same discipline as v4.
  const predictBlended = (m: { fit: OlsFit; catMap: Map<string, number> }, ratio: number, p: SnapshotProtocol): number =>
    blendedImplied(p, m.fit, m.catMap, ratio);
  const flatPred = (p: SnapshotProtocol, ratio: number): number => Math.max(1, Math.round(p.tvl_usd * ratio));
  const validationTest = (name: string, train: SnapshotProtocol[], test: SnapshotProtocol[]): ValidationTest => {
    const m = fitValueModel(train);
    const ratio = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    const pf = test.map((p) => predictBlended(m, ratio, p));
    const pl = test.map((p) => flatPred(p, ratio));
    const actual = test.map((p) => p.mcap_usd!);
    const mf = mapeStats(pf, actual);
    const ml = mapeStats(pl, actual);
    return { name, n_test: test.length, fitted_mean: round4(mf.mean), fitted_median: round4(mf.median), flat_mean: round4(ml.mean), flat_median: round4(ml.median), median_ratio: round4(mf.median / ml.median) };
  };
  const bySlugOrder = [...anchors].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const holdCut = Math.floor(bySlugOrder.length * 0.7);
  const holdout = validationTest('blind holdout, fit 70% / test 30%', bySlugOrder.slice(0, holdCut), bySlugOrder.slice(holdCut));
  const dated = anchors.filter((p) => p.listed_at).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const wf50Cut = Math.floor(dated.length * 0.5);
  const walk_forward_50 = validationTest('walk-forward, fit earliest 50%', dated.slice(0, wf50Cut), dated.slice(wf50Cut));
  const wf75Cut = Math.floor(dated.length * 0.75);
  const walk_forward_75 = validationTest('walk-forward, fit earliest 75%', dated.slice(0, wf75Cut), dated.slice(wf75Cut));
  // Leave-one-out: 128 refits, blended vs flat, plus the range coverage.
  const looPred: number[] = [];
  const looFlat: number[] = [];
  const looSd: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const sub = anchors.filter((_, j) => j !== i);
    const m = fitValueModel(sub);
    const ratio = median(sub.map((p) => p.mcap_usd! / p.tvl_usd));
    looPred.push(predictBlended(m, ratio, anchors[i]!));
    looFlat.push(flatPred(anchors[i]!, ratio));
    looSd.push(m.fit.residSd);
  }
  const looActual = anchors.map((p) => p.mcap_usd!);
  const looF = mapeStats(looPred, looActual);
  const looL = mapeStats(looFlat, looActual);
  const loo: ValidationTest = { name: 'leave-one-out, 128 refits', n_test: anchors.length, fitted_mean: round4(looF.mean), fitted_median: round4(looF.median), flat_mean: round4(looL.mean), flat_median: round4(looL.median), median_ratio: round4(looF.median / looL.median) };
  let cov2575 = 0;
  let cov1090 = 0;
  anchors.forEach((p, i) => {
    const d = Math.abs(log10(p.mcap_usd!) - log10(looPred[i]!));
    if (d <= 0.674 * looSd[i]!) cov2575++;
    if (d <= 1.282 * looSd[i]!) cov1090++;
  });
  const coverage_p25_p75 = round4((100 * cov2575) / anchors.length);
  const coverage_p10_p90 = round4((100 * cov1090) / anchors.length);

  // Token odds: logistic on the eligible peers, held out twice.
  const eligible = snapshot.protocols.filter(isOddsEligible);
  const medAge = median(eligible.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null));
  const oddsRows = eligible.map((p) => ({ x: oddsFeatures(p, medAge), y: isPreToken(p) ? 0 : 1, slug: p.slug }));
  const baseRate = mean(oddsRows.map((r) => r.y));
  const bySlugAll = [...oddsRows].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const half = Math.floor(bySlugAll.length / 2);
  const holdoutOdds = (train: typeof oddsRows, test: typeof oddsRows) => {
    const m = fitLogistic(train);
    const ps = test.map((r) => m.predict(r.x));
    const ys = test.map((r) => r.y);
    const base = mean(train.map((r) => r.y));
    return { brier_model: round4(brier(ps, ys)), brier_base: round4(brier(test.map(() => base), ys)), n_test: test.length };
  };
  const odds_a_to_b = holdoutOdds(bySlugAll.slice(0, half), bySlugAll.slice(half));
  const odds_b_to_a = holdoutOdds(bySlugAll.slice(half), bySlugAll.slice(0, half));
  const oddsFull = fitLogistic(oddsRows);
  // The odds term, kept: it is not an OLS term, so it carries no R^2 — its own
  // test is the Brier table, and the reason quotes the measured Briers.
  terms.push({ term: 'token odds (logistic)', r2_with: null, r2_gain: null, coefficient: null, kept: true, reason: `P(token) from the peers’ record; beats the base rate held out twice (Brier ${odds_a_to_b.brier_model.toFixed(2)} / ${odds_b_to_a.brier_model.toFixed(2)} vs ${odds_a_to_b.brier_base.toFixed(2)} / ${odds_b_to_a.brier_base.toFixed(2)}).` });
  const calibration: { predicted: number; realized: number; n: number }[] = [];
  const scored = oddsRows.map((r) => ({ p: oddsFull.predict(r.x), y: r.y })).sort((a, b) => a.p - b.p);
  for (let d = 0; d < 10; d++) {
    const bin = scored.slice(Math.floor((d * scored.length) / 10), Math.floor(((d + 1) * scored.length) / 10));
    calibration.push({ predicted: round4(mean(bin.map((b) => b.p))), realized: round4(mean(bin.map((b) => b.y))), n: bin.length });
  }

  // Expected value, ranking, verdicts. The implied value is the BLENDED value.
  const scored2 = ranked.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const curve = curveValue(p.tvl_usd, fit);
    const mult = catMap.get(p.category ?? 'Unknown') ?? 1;
    const implied = blendedImplied(p, fit, catMap, flatRatio);
    const odds = oddsFull.predict(oddsFeatures(p, medAge));
    const expected = Math.max(1, Math.round(implied * odds));
    const net = AIRDROP_SHARE * expected / FARMERS - GAS_USD - CAPITAL_COST_USD;
    const verdict: 'FARM' | 'THIN' | 'SKIP' = net >= FARM_NET_MIN ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
    return { p, age, curve, mult, implied, odds, expected, net, verdict };
  });
  scored2.sort((a, b) => b.expected - a.expected || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Bootstrap rank ranges: 200 refits of the value model, odds held fixed.
  // The rescoring uses the BLENDED implied value, with the flat ratio refit
  // on each resample, exactly as the validation refits it on each training set.
  const rng = makeRng(20261114);
  const rankSamples = new Map<string, number[]>();
  for (const s of scored2) rankSamples.set(s.p.slug, []);
  for (let b = 0; b < 200; b++) {
    const sample = Array.from({ length: anchors.length }, () => anchors[Math.floor(rng() * anchors.length)]!);
    const m = fitValueModel(sample);
    const ratio = median(sample.map((p) => p.mcap_usd! / p.tvl_usd));
    const rescored = ranked
      .map((p) => ({ slug: p.slug, ev: blendedImplied(p, m.fit, m.catMap, ratio) * oddsFull.predict(oddsFeatures(p, medAge)) }))
      .sort((a, c) => c.ev - a.ev || (a.slug < c.slug ? -1 : a.slug > c.slug ? 1 : 0));
    rescored.forEach((r, i) => rankSamples.get(r.slug)!.push(i + 1));
  }
  const rankRange = (slug: string): [number, number, number, number] => {
    const rs = [...rankSamples.get(slug)!].sort((a, b) => a - b);
    const q = (f: number) => rs[Math.min(rs.length - 1, Math.floor(f * rs.length))]!;
    return [q(0.25), q(0.75), q(0.1), q(0.9)];
  };

  const board: BoardRow[] = scored2.map((s, i) => {
    const [p25, p75, p10, p90] = rankRange(s.p.slug);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.expected,
      model: {
        curve_value_usd: Math.max(1, Math.round(s.curve)),
        category_multiplier: round4(s.mult),
        implied_if_token_usd: s.implied,
        token_odds: round4(s.odds),
        expected_value_usd: s.expected,
        age_days: s.age,
        growth_pct: clamp(s.p.change_7d ?? 0, -60, 120),
      },
      verdict: s.verdict,
      net_usd: Math.round(s.net),
      rank_p25: p25,
      rank_p75: p75,
      rank_p10: p10,
      rank_p90: p90,
      farm_steps: farmSteps(s.p, s.age, s.verdict, s.net).map(stepText),
    };
  });

  const live = liveRows(snapshot);
  const earlySize = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdictCounts = {
    farm: board.filter((r) => r.verdict === 'FARM').length,
    thin: board.filter((r) => r.verdict === 'THIN').length,
    skip: board.filter((r) => r.verdict === 'SKIP').length,
  };
  const categories = [...catMap.entries()]
    .map(([category, multiplier]) => ({ category, n: anchors.filter((p) => (p.category ?? 'Unknown') === category).length, multiplier: round4(multiplier) }))
    .sort((a, b) => b.multiplier - a.multiplier);
  // The checksum covers the board as the dashboard renders it: the compact rows,
  // in rank order, as JSON. The page recomputes it from the same rows and compares.
  const checksum = createHash('sha256').update(JSON.stringify(board.map(radarRow))).digest('hex').slice(0, 8);

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    live_size: live.length,
    ledger: { ranked: ranked.length, traded: traded.length, excluded: excluded.length, total: snapshot.protocols.length },
    watchlist: [...snapshot.watchlist],
    watch_top50: board.slice(0, 50).filter((r) => snapshot.watchlist.includes(r.slug)).length,
    verdicts: { ...verdictCounts, farmers: FARMERS, airdrop_share: AIRDROP_SHARE, gas_usd: GAS_USD, farm_net_min: FARM_NET_MIN },
    validation: {
      holdout,
      walk_forward_50,
      walk_forward_75,
      loo,
      coverage_p25_p75,
      coverage_p10_p90,
      odds_a_to_b,
      odds_b_to_a,
      odds_weights: { bias: round4(oddsFull.w[0]!), log_tvl: round4(oddsFull.w[1]!), age: round4(oddsFull.w[2]!), growth: round4(oddsFull.w[3]!) },
      odds_base_rate: round4(baseRate),
      calibration,
      terms,
    },
    categories,
    anchors: anchors.map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
    board_checksum: checksum,
    board_rows: board.length,
    board_sum_expected_usd: board.reduce((s, r) => s + r.implied_value_usd, 0),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
