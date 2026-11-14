# Token Radar — radar-2

A token launch radar: 226 pre-token protocols ranked by implied value, from a
sealed DefiLlama snapshot (758 protocols, 2026-11-14). The board covers all 40
watchlist protocols and adds 186 pre-token protocols below the $50M floor.

## The model (radar-2)

Implied value follows only from the snapshot's own figures:

1. **Category multiple** — what the market pays for a dollar of TVL in this
   protocol's own category: the median market-cap / TVL of live-token peers
   in the same category, shrunk toward the global median
   `(n * category + 6 * global) / (n + 6)` and clipped to [0.05, 0.80].
   A category with fewer than 3 live peers uses the global median; exchanges
   are never peers. Every row carries its multiple and peer count.
2. **Growth** — `1 + clamp(change_7d, -60, 60) / 100 * 0.5`. One week is a
   noisy window, so a single 44x spike cannot decide a ranking.
3. **Maturity** — `0.6 + min(age_days, 1095) / 1095 * 0.4` (unknown age: 365d).

`implied = round(tvl_usd * category_multiple * growth * maturity)`

No protocol name is special-cased. The dashboard recomputes each row from
the same arithmetic and says so in its detail view.

## Farm plans

Six steps per protocol, derived from its category, chains, TVL and age: a
category action, a different weekly qualifying action, a hold window, a
claim-safety step, and a test withdrawal ($10 first) as the exit.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and
`dossier.json` to the output directory. Screenshots are headless-Chrome
captures of the dashboard itself: the board, a protocol's detail view, and a
filtered (Dexs) view.
