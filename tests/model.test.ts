// Tests for Launch Ledger v5 (lib/model.ts). Run with:
//   node --test tests/model.test.ts
// The integration test reads the real snapshot when it is present next to
// this repo (../token-radar-01-kit/input/snapshot.json) and skips cleanly
// when it is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ageDays,
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
  type Snapshot,
  type SnapshotProtocol,
} from '../lib/model.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const KIT_SNAPSHOT = join(here, '..', '..', 'token-radar-01-kit', 'input', 'snapshot.json');

function proto(over: Partial<SnapshotProtocol> & { slug: string }): SnapshotProtocol {
  return {
    name: over.slug,
    category: 'Dexs',
    chains: ['Ethereum'],
    tvl_usd: 100_000_000,
    change_7d: 5,
    mcap_usd: null,
    listed_at: '2024-01-01',
    gecko_id: null,
    symbol: null,
    ...over,
  };
}

/** A small synthetic snapshot with an exact log-linear anchor set, so the
 *  OLS fit recovers known coefficients and every gate invariant is checkable. */
function synthetic(): Snapshot {
  const protocols: SnapshotProtocol[] = [];
  // 12 traded anchors: mcap = 10^(3 + 0.5*log10(TVL)) exactly, two categories.
  for (let i = 0; i < 12; i++) {
    const tvl = 10_000_000 * (i + 1) * (i + 1);
    const mcap = Math.round(10 ** (3 + 0.5 * Math.log10(tvl)));
    protocols.push(proto({
      slug: `anchor-${i}`,
      name: `Anchor ${i}`,
      category: i % 2 ? 'Dexs' : 'Lending',
      tvl_usd: tvl,
      mcap_usd: mcap,
      gecko_id: `anchor-${i}`,
      symbol: `ANC${i}`,
      listed_at: `202${i % 3}-0${(i % 9) + 1}-15`,
    }));
  }
  // 2 old traded + 2 young pre-token: the odds model must rank age up.
  // Both traded rows sit exactly on the anchor curve, so the OLS stays exact.
  const onCurve = Math.round(10 ** (3 + 0.5 * Math.log10(500_000_000)));
  protocols.push(proto({ slug: 'old-traded', name: 'Old Traded', tvl_usd: 500_000_000, mcap_usd: onCurve, gecko_id: 'old', symbol: 'OLD', listed_at: '2020-06-01' }));
  protocols.push(proto({ slug: 'young-traded', name: 'Young Traded', tvl_usd: 500_000_000, mcap_usd: onCurve, gecko_id: 'young', symbol: 'YNG', listed_at: '2026-10-01' }));
  // Watchlist: two big pre-token names above the floor.
  protocols.push(proto({ slug: 'watch-a', name: 'Watch A', tvl_usd: 2_000_000_000, listed_at: '2021-03-01' }));
  protocols.push(proto({ slug: 'watch-b', name: 'Watch B', tvl_usd: 800_000_000, listed_at: '2023-07-01' }));
  // Below-floor rankable pre-token names.
  for (let i = 0; i < 6; i++) {
    protocols.push(proto({ slug: `early-${i}`, name: `Early ${i}`, tvl_usd: 40_000_000 - i * 1_000_000, listed_at: i < 3 ? '2022-01-01' : '2026-01-01' }));
  }
  // Excluded: one exchange, one versioned pool, one above-floor non-watchlist.
  protocols.push(proto({ slug: 'some-cex', name: 'Some CEX', category: 'CEX', tvl_usd: 300_000_000 }));
  protocols.push(proto({ slug: 'some-v2', name: 'Some V2', tvl_usd: 30_000_000 }));
  protocols.push(proto({ slug: 'above-floor', name: 'Above Floor', tvl_usd: 900_000_000 }));
  return { as_of: '2026-11-14', source: 'synthetic', floor_usd: 50_000_000, protocols, watchlist: ['watch-a', 'watch-b'] };
}

test('parseSnapshot rejects bad input', () => {
  assert.throws(() => parseSnapshot('not json'), /not JSON/);
  assert.throws(() => parseSnapshot('{"as_of":"2026-11-14"}'), /no source/);
  assert.throws(() => parseSnapshot('{"as_of":"2026-11-14","source":"x"}'), /floor_usd/);
  assert.throws(() => parseSnapshot(JSON.stringify({ as_of: '2026-11-14', source: 'x', floor_usd: 1, protocols: [{ slug: 'a' }], watchlist: [] })), /lacks a slug/);
  const ok = parseSnapshot(JSON.stringify(synthetic()));
  assert.equal(ok.protocols.length, synthetic().protocols.length);
});

test('ageDays counts whole days and tolerates missing dates', () => {
  assert.equal(ageDays('2026-11-14', '2026-11-13'), 1);
  assert.equal(ageDays('2026-11-14', '2025-11-14'), 365);
  assert.equal(ageDays('2026-11-14', null), null);
  assert.equal(ageDays('2026-11-14', '2027-01-01'), 0);
});

test('synthetic board: gate invariants hold', () => {
  const snap = synthetic();
  const { board, radar } = buildRadar(snap);
  assert.equal(boardIssue(board, snap), null);
  assert.equal(radar.ledger.ranked, 8); // 2 watchlist + 6 below-floor
  assert.equal(radar.ledger.traded, 14);
  assert.equal(radar.ledger.excluded, 3);
  assert.equal(radar.ledger.total, 25);
  assert.equal(radar.ledger.ranked + radar.ledger.traded + radar.ledger.excluded, radar.ledger.total);
  assert.equal(radar.watchlist_size, 2);
  assert.equal(radar.watch_top50, 2);
  for (let i = 1; i < board.length; i++) assert.ok(board[i]!.implied_value_usd <= board[i - 1]!.implied_value_usd, 'values non-rising');
  for (const r of board) {
    assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
    for (const s of r.farm_steps) assert.ok(s.length >= 20 && s.length <= 600, `farm step length ${s.length}`);
    assert.ok(['FARM', 'THIN', 'SKIP'].includes(r.verdict));
    assert.ok(r.rank_p25 >= 1 && r.rank_p25 <= r.rank_p75 && r.rank_p75 <= board.length);
  }
  assert.equal(radar.verdicts.farm + radar.verdicts.thin + radar.verdicts.skip, board.length);
});

test('synthetic OLS recovers the exact curve', () => {
  const { radar } = buildRadar(synthetic());
  // Anchors are noise-free: mcap = 10^(3 + 0.5*log10(TVL)).
  assert.ok(Math.abs(radar.model.intercept - 3) < 0.01, `intercept ${radar.model.intercept}`);
  assert.ok(Math.abs(radar.model.slope - 0.5) < 0.01, `slope ${radar.model.slope}`);
  assert.ok(radar.model.r2 > 0.999, `r2 ${radar.model.r2}`);
  assert.equal(radar.model.anchors, 14);
});

test('the blend sits between the curve and the flat multiple', () => {
  // On the synthetic snapshot the curve is exact, so the blended implied
  // value must lie between the curve value and the flat value for every row.
  const { radar } = buildRadar(synthetic());
  const flat = radar.model.flat_ratio;
  for (const r of radar.rows) {
    const curve = Math.pow(10, radar.model.intercept + radar.model.slope * Math.log10(Math.max(1, r.tvl_usd))) * r.category_multiplier;
    const flatV = Math.max(1, r.tvl_usd * flat);
    const lo = Math.min(curve, flatV);
    const hi = Math.max(curve, flatV);
    assert.ok(r.implied_if_token_usd >= Math.floor(lo) - 1 && r.implied_if_token_usd <= Math.ceil(hi) + 1,
      `${r.slug}: blended ${r.implied_if_token_usd} outside [${lo}, ${hi}]`);
  }
});

test('checksum in data.js matches sha256 over the compact rows', () => {
  const { radar } = buildRadar(synthetic());
  const script = dataScript(radar);
  const parsed = JSON.parse(script.slice('window.RADAR='.length, -2));
  const recomputed = createHash('sha256').update(JSON.stringify(parsed.rows)).digest('hex').slice(0, 8);
  assert.equal(parsed.board_checksum, recomputed);
  assert.equal(parsed.board_sum_expected_usd, parsed.rows.reduce((s: number, r: { implied_value_usd: number }) => s + r.implied_value_usd, 0));
});

test('two runs on the same snapshot are identical', () => {
  const snap = synthetic();
  const a = buildRadar(snap);
  const b = buildRadar(snap);
  assert.equal(JSON.stringify(a.board), JSON.stringify(b.board));
  assert.equal(dataScript(a.radar), dataScript(b.radar));
});

test('odds rise with age, all else equal', () => {
  const { radar } = buildRadar(synthetic());
  const rows = new Map(radar.rows.map((r) => [r.slug, r]));
  // The two young/old pre-token rows below the floor share a TVL tier; the
  // older one must carry the higher token odds through the age term.
  const early = radar.rows.filter((r) => r.slug.startsWith('early-'));
  const oldOnes = early.filter((r) => (r.age_days ?? 0) > 1000);
  const youngOnes = early.filter((r) => (r.age_days ?? 0) < 400);
  assert.ok(oldOnes.length > 0 && youngOnes.length > 0);
  const oldOdds = Math.max(...oldOnes.map((r) => r.token_odds));
  const youngOdds = Math.max(...youngOnes.map((r) => r.token_odds));
  assert.ok(oldOdds > youngOdds, `old odds ${oldOdds} should exceed young odds ${youngOdds}`);
  assert.ok(rows.has('watch-a') && rows.has('watch-b'));
});

test('real snapshot integration (skipped when the kit snapshot is absent)', () => {
  if (!existsSync(KIT_SNAPSHOT)) {
    console.log('# skip: kit snapshot not present');
    return;
  }
  const snap = parseSnapshot(readFileSync(KIT_SNAPSHOT, 'utf8'));
  const { board, radar } = buildRadar(snap);
  assert.equal(boardIssue(board, snap), null);
  assert.deepEqual([radar.ledger.ranked, radar.ledger.traded, radar.ledger.excluded], [226, 416, 116]);
  assert.equal(radar.model.anchors, 128);
  assert.ok(Math.abs(radar.model.intercept - 3.0247) < 0.001);
  assert.ok(Math.abs(radar.model.slope - 0.5223) < 0.001);
  assert.ok(Math.abs(radar.model.r2 - 0.1939) < 0.001);
  assert.equal(radar.model.blend_w, 0.28);
  // FARM stays 20; the blend moves 12 rows from THIN to SKIP (their net falls
  // below $0 as the blend pulls small-TVL implied values toward the flat
  // multiple). The split is measured, not assumed.
  assert.deepEqual([radar.verdicts.farm, radar.verdicts.thin, radar.verdicts.skip], [20, 91, 115]);
  assert.equal(board[0]!.slug, 'steakhouse-financial');
  assert.equal(radar.watch_top50, 34);
  assert.equal(radar.board_checksum, '30f908cf');
  // Validation: the blended curve. The holdout median still loses to the flat
  // multiple, but the gap is 1.4 points (84.4 vs 83.0), down from v4's 9.8.
  const V = radar.validation;
  const close = (a: number, b: number, tol = 1.0) => Math.abs(a - b) <= tol;
  assert.ok(close(V.holdout.fitted_mean, 2777.5), `holdout mean ${V.holdout.fitted_mean}`);
  assert.ok(close(V.holdout.fitted_median, 84.4), `holdout median ${V.holdout.fitted_median}`);
  assert.ok(close(V.holdout.flat_median, 83.0), `holdout flat median ${V.holdout.flat_median}`);
  assert.ok(close(V.walk_forward_50.fitted_mean, 732.0), `wf50 mean ${V.walk_forward_50.fitted_mean}`);
  assert.ok(close(V.walk_forward_50.fitted_median, 86.4), `wf50 median ${V.walk_forward_50.fitted_median}`);
  assert.ok(close(V.walk_forward_75.fitted_mean, 575.4), `wf75 mean ${V.walk_forward_75.fitted_mean}`);
  assert.ok(close(V.walk_forward_75.fitted_median, 76.6), `wf75 median ${V.walk_forward_75.fitted_median}`);
  assert.ok(close(V.loo.fitted_mean, 1381.3), `loo mean ${V.loo.fitted_mean}`);
  assert.ok(close(V.loo.fitted_median, 84.7), `loo median ${V.loo.fitted_median}`);
});
