# Launch Ledger v5

[![Bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/Ci3hu1/token-radar-01-v5/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Ci3hu1/token-radar-01-v5/reward.svg)](https://make.fun/bounty/token-radar-01)

The pre-token radar that prices the launch before it happens — an entry for
the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01) on
[make.fun](https://make.fun) (referral code `cc7tcnw6`).

## What it does

A working radar over the 758 protocols in the snapshot (as of 2026-11-14):
226 pre-token protocols ranked by **expected launch value** — the implied
value if a protocol tokens, times P(it ever tokens) — plus the 416 already
traded and the 116 excluded, every one accounted for in the ledger.

- **Value:** the fitted curve 10^(3.0247 + 0.5223·log10(TVL)) times a
  category multiplier, fitted on 128 traded anchors — then blended 0.28 of
  the way toward the flat multiple (median mcap/TVL 0.2138). The blend closes
  the random-holdout median gap from 9.8 points (v4) to 1.4 (84.4% vs 83.0%).
- **Token odds:** a logistic on log10(TVL), age and 7d growth, fitted on 449
  eligible peers, held out twice (Brier 0.20 / 0.21 vs base 0.25).
- **Verdicts:** netted farm plans — 5% of expected value across 10,000
  assumed farmers, minus $12 of gas and $1 of capital cost. 20 FARM, 91 THIN,
  115 SKIP.
- **Evidence on the first screen:** walk-forward and holdout tests, Brier
  scores, calibration deciles, term tests (growth, age and chain count were
  fitted and dropped), bootstrap rank ranges, and a checksum the page
  recomputes live in the browser.
- **New in v5:** compare mode (2–3 rows side by side), CSV export of the
  board, pinned rows, and tabbed field notes (Factors / Comps / Plan).

## Run it

Node 22+, standard library only. No dependencies, no network.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

That writes `board.json`, `data.js`, `dashboard/` (3 files), `screenshots/`
(3 images) and `dossier.json` into the output directory. Run the tests with:

```sh
node --test tests/model.test.ts
```

## Files

- `lib/model.ts` — the model: OLS, category multipliers, the 0.28 flat
  blend, logistic odds, validation, bootstrap, verdicts, checksum.
- `dashboard/` — the field-guide page (light paper, serif masthead, ruled
  lines): `index.html`, `app.css`, `app.js`.
- `screenshots/` — 1-board.png, 2-evidence.png, 3-detail.png (1440×900).
- `main.ts` — the entrypoint. `tests/model.test.ts` — 9 tests.
- `STRATEGY.md` — the top-10 study and what v5 changes vs v4.
- `NOTES.md` — the fitted values, the validation table, and the build record.

## License

MIT. See [LICENSE](LICENSE).
