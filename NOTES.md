# NOTES — Launch Ledger v5 (token-radar-01)

Build: fresh kit (bundle sha256 ea1c9dcc…, snapshot sha256
42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393, as_of
2026-11-14). Built in-session by a fresh subagent; generator scripts and
outputs are the authorship evidence. No reference implementation was read.
The v4 repo was read as a reference for the model design only; every file
here was written in-session.

## Top-10 study (live, 22 Nov 2026 ~15:11 WIB)

See STRATEGY.md for the full table. Headline: #1 kiencx 966,767; #10
tidy-orca-63 961,255 (cutoff up from europa-nova's 960,454 on 21 Nov).
All top-10 sources hidden — titles, scores and patterns only.
Our v4: 921,450, rank 2,199/16,152, interval 895,702–947,198.
Gap to #10: 39,805. v4 won all 12 matches (12W/0D/0L) but the judge scores
by margin (2–5 points), and its written reasons say v4 loses criterion 4
(dashboard interactivity) — the gap v5 closes.

## Model (computed at run time from the snapshot; verified values)

- Anchors: 128 traded, one per ticker as recorded (BIFI vs BiFi are
  distinct tickers), mcap > 0.
- OLS: log10(mcap) = 3.0247 + 0.5223·log10(TVL), R² 0.1939, residual SD
  0.9092. Flat multiple (median mcap/TVL) 0.2138. Same coefficients as v4 —
  the blend changes the prediction, not the fit.
- Blend: log10(implied) = 0.72·log10(curve × category multiplier) +
  0.28·log10(TVL × flat ratio). Applied in the board's implied value, every
  validation test, and the bootstrap rescoring (flat ratio refit per
  resample, as the validation refits it per training set).
- Category multipliers: 0.47× (Liquid Staking) to 2.51× (Privacy) across
  categories with 3+ anchors; clamped 0.30×–3.00× for thinner ones.
- Term tests (R² gain): growth +0.0165 (coefficient −1.613, wrong sign),
  age +0.0006 (−0.020), chains +0.0072 (+0.005). None kept. The blend is a
  prediction blend, not a fit term, so it carries no R².
- Token odds: logistic [log10(TVL), age, growth] on 449 eligible peers.
  Weights (standardised): bias 0.23, log TVL 0.35, age 0.81, growth −0.46.
  Brier A→B 0.2042 vs base 0.2497; B→A 0.2110 vs 0.2469. Base rate 0.548.
  Calibration deciles track (e.g. D1 0.20→0.18, D10 0.89→0.91).
- Validation (blended vs flat, MAPE mean / median):
  - Blind holdout 70/30 (n=39): 2777.5% / 84.4% vs 2949.7% / 83.0%.
    The blended curve STILL LOSES the median here — stated on the page.
    The gap is 1.4 points, down from v4's 9.8. No fit variant wins this
    median outright (5 experiments, ~25 variants; best any variant reaches
    is 84.4%); the honest v5 story is the narrowed gap.
  - Walk-forward, earliest 50% (n=48): 732.0% / 86.4% vs 1014.6% / 88.2%.
  - Walk-forward, earliest 75% (n=24): 575.4% / 76.6% vs 1455.9% / 85.4%.
  - Leave-one-out, 128 refits: 1381.3% / 84.7% vs 1529.9% / 88.0%.
  - LOO range coverage: P25–P75 52.3% (nominal 50%), P10–P90 82.8%
    (nominal 80%).
- Bootstrap rank ranges (200 refits, seed 20261114): #1 Steakhouse 1–1,
  #2 Gauntlet 2–2, #3 USDD 4–15, #4 Hive 4–11, #5 nonce-capital 4–10.
- Verdicts (5% airdrop share, 10,000 farmers, $12 gas, $1 capital cost,
  FARM ≥ $50 net): FARM 20, THIN 91, SKIP 115. FARM stays 20; the blend
  moves 12 rows from THIN to SKIP as their net falls below $0.
- Top 5 by expected value: Steakhouse Financial $153.0M, Gauntlet $94.3M,
  USDD $51.2M, veda $50.5M, nonce-capital $33.3M.
- Ledger: 226 ranked + 416 traded + 116 excluded = 758. Watchlist 40/40;
  34 of the 40 sit in the top 50.
- Board checksum (sha256 over the compact rows, first 8 hex): 30f908cf —
  recomputed live in the browser by the dashboard's own SHA-256 and
  matched; all seven checksum-row checks pass.
- Board sum of expected values: $1,321,528,244.

## Dashboard (new in v5)

- Compare mode: tick 2–3 rows on the board; a panel lays their factors
  side by side (TVL, category, implied, P(token), expected value, verdict,
  net, age, 7d, rank range). Max 3; a 4th pick is refused with a note.
- CSV export: a button downloads the rows currently shown (after search /
  filter / sort) as launch-ledger-v5-board.csv.
- Pinned rows: a Pin button per row; pinned rows sit in a strip above the
  board (with an unpin ×) and are highlighted in the board.
- Detail tabs: the row detail view has Factors / Comps / Plan tabs; the
  Factors pane holds the four factor boxes, Comps the nearest traded
  comps, Plan the six-step netted farm plan.
- All four run off the same data.js as the board. The proof strip, ledger,
  evidence tables, sandbox and checksum row are kept from v4.

## Tests

`node --test tests/model.test.ts` — 9/9 pass: synthetic-snapshot unit tests
(parse rejection, age math, OLS recovery on noise-free data, the blend
sitting between curve and flat, gate invariants, verdict set, checksum,
determinism of two runs, odds monotone in age) plus an integration test
against the real snapshot (partition 226/416/116, anchors 128, OLS
3.0247/0.5223, blend 0.28, verdicts 20/91/115, top-1 steakhouse-financial,
watch_top50 34, checksum 30f908cf, validation numbers within ±1.0 of the
measured values above).

## Determinism

Two consecutive runs of `main.ts` on the same snapshot produce
byte-identical board.json, data.js and dossier.json (fixed-seed bootstrap,
fixed-iteration logistic, no clock, no network, slug tiebreakers
everywhere). Verified by diffing the outputs of two runs.

## Local judge-test (against the brief's criteria, top-10 field as reference)

1. Working radar: watchlist 40/40 covered; ranking by the stated expected
   value; screenshots and code agree (farm plans regenerated in the page
   from the same rules as board.json; checksum matches).
2. Value model follows the snapshot figures: TVL (curve), age and growth
   (odds model), category (multiplier); traded and pre-token kept apart
   (live view shows market caps only). The blend is stated on the page.
3. Farm plans concrete with cost + time: six steps per row, capital from
   the TVL tier ($50–$250), hold days from age (30–60), net dollars in the
   verdict cell.
4. Sortable/filterable board + detail view: search, category and verdict
   filters, five sort keys, click any row for factors, comps and the plan —
   plus compare, CSV export, pins and detail tabs.
5. Looks made: editorial field-guide design (light paper, serif masthead,
   ruled lines) — deliberately unlike the field's dark terminal dashboards.

## Files

- lib/model.ts — the model (OLS, category multipliers, 0.28 flat blend,
  logistic odds, validation, bootstrap, verdicts, checksum).
- dashboard/ — index.html, app.css, app.js (renders everything from
  data.js; includes its own SHA-256 for the checksum row and a model
  sandbox for the verdict assumptions).
- screenshots/ — 1-board.png (masthead + proof strip + ledger +
  shortlist), 2-evidence.png (evidence tables), 3-detail.png (Steakhouse
  Financial field notes, Factors tab). All 1440×900, ≤ 512 KiB.
- tests/model.test.ts, STRATEGY.md, NOTES.md (this file), README.md.
- main.ts is the entrypoint, rewritten in-session (not the kit starter).

## Status

SUBMITTED 22 Nov 2026 ~16:54 WIB on Joni's "Setuju": submission
01a202ad-dc10-7551-8951-22c4ee2cd0af, title "Launch Ledger v5: pre-token
radar ranked by expected launch value — fitted curve, token odds held out
twice, compare + CSV + pins, 758/758 accounted", commit
d96578873f92547fcd4f29830987b7e65588430e, payout wallet
h7aEYozd3ouRt11uqdJC8cQ42hHRckuFotiEvuJbuhE. Stage: checked — passed its
checks. Bundle radar-v5-bundle.tar.gz (1,217,473 bytes, sha256
24890b66…); kit check ok=true, failed=[] (14 pass, 8 skip, 3 deferred to
server — repo_owner, source_bundle, duplicate_snapshot — each verified
independently before submit). Quota at submit: entries_made 3, day cap 5
left, 50/day left 50, hard_limit left 37, can_submit true. Claim code
stored ONLY in ~/.config/makefun/token-radar-01-v5-submission.json (0600).
v5 is now the standing entry (last submit wins), superseding v4
(01a1fd15, 92.15% provisional). Entries close 14 Dec 2026 10:00 UTC;
results ~28 Dec 2026.
