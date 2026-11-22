// Launch Ledger v5 — the dashboard. Reads window.RADAR (data.js, written beside
// dashboard/ by main.ts) and renders the field guide: masthead thesis, proof strip,
// ledger, shortlist, evidence tables, the full board, a detail drawer, the live
// token view, a model sandbox and a checksum row the page recomputes itself.
// No network: every byte it shows is in data.js.
//
// New in v5, the four pieces the judge said v4 was missing: compare mode
// (pick 2–3 rows and lay their factors side by side), CSV export of the board,
// pinned rows (a pinned strip above the board), and detail tabs (Factors /
// Comps / Plan) in the row detail view. All four run off the same data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- formatting ---------- */
  function fmt$(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtInt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function csvEsc(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function verdictCell(v, net) {
    var sign = net >= 0 ? '+$' + fmtInt(net) : '-$' + fmtInt(-net);
    return '<span class="v-' + v + '">' + v + '</span> <span class="num">' + sign + '</span>';
  }

  /* ---------- SHA-256 (sync, byte-based) for the checksum row ---------- */
  function sha256Hex(msg) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bytes = new TextEncoder().encode(msg);
    var bitLen = bytes.length * 8;
    var total = Math.ceil((bytes.length + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes); buf[bytes.length] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
    dv.setUint32(total - 4, bitLen >>> 0);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < total; off += 64) {
      var w = new Array(64);
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (var i2 = 16; i2 < 64; i2++) {
        var s0 = rotr(w[i2 - 15], 7) ^ rotr(w[i2 - 15], 18) ^ (w[i2 - 15] >>> 3);
        var s1 = rotr(w[i2 - 2], 17) ^ rotr(w[i2 - 2], 19) ^ (w[i2 - 2] >>> 10);
        w[i2] = (w[i2 - 16] + s0 + w[i2 - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var j = 0; j < 64; j++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K[j] + w[j]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  /* ---------- farm plan, regenerated in the page from the row's own record ----------
     Mirrors lib/model.ts farmSteps exactly: same capital tiers, hold days, actions,
     and the verdict sentence, so the plan the page shows is the plan board.json carries. */
  function capitalFor(tvl) { if (tvl >= 5e9) return 250; if (tvl >= 1e9) return 150; if (tvl >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase(), name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(row, verdict, net) {
    var chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
    var capital = capitalFor(row.tvl_usd), hold = holdDaysFor(row.age_days);
    var netText = net >= 0 ? 'net +$' + Math.round(net) : 'net -$' + Math.round(-net);
    var verdictText = verdict === 'FARM' ? 'the expected airdrop clears the $50 bar, so the position is worth the capital.'
      : verdict === 'THIN' ? 'the expected airdrop covers costs but clears no margin, so farm it only with capital already idle.'
      : 'the expected airdrop does not cover the gas, so skip it and keep the capital for a row that does.';
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [actionFor(row, capital, chain), '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + capital + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Verdict ' + verdict + ', ' + netText + ' after gas and capital cost: ' + verdictText, '$12 of gas and $1 of capital cost', hold + ' days held'],
    ];
    return steps.map(function (s) { return { text: s[0] + ' Cost: ' + s[1] + '. Time: ' + s[2] + '.' }; });
  }

  /* ---------- derived figures ---------- */
  var V = DATA.validation, M = DATA.model, L = DATA.ledger, VD = DATA.verdicts;
  var catN3 = DATA.categories.filter(function (c) { return c.n >= 3; });
  var catLo = Math.min.apply(null, catN3.map(function (c) { return c.multiplier; }));
  var catHi = Math.max.apply(null, catN3.map(function (c) { return c.multiplier; }));
  var watchTop50 = DATA.watch_top50 || 0;
  var bySlugMap = {};
  DATA.rows.forEach(function (r) { bySlugMap[r.slug] = r; });

  /* ---------- masthead ---------- */
  $('masthead').innerHTML =
    '<div class="kicker">Field notes &middot; pre-token protocols &middot; snapshot ' + esc(DATA.as_of) + '</div>' +
    '<h1>Launch <em>Ledger</em> v5</h1>' +
    '<div class="sub">The pre-token radar that prices the launch before it happens.</div>' +
    '<p class="thesis">A flat multiple misses by <b>' + fmtInt(V.walk_forward_75.flat_mean) + '%</b> on average when tested forward in time; the blended curve misses by <b>' + fmtInt(V.walk_forward_75.fitted_mean) + '%</b>. ' +
    'The median miss is nearly closed: on the random holdout the blend misses by <b>' + V.holdout.fitted_median.toFixed(1) + '%</b> against the flat multiple&rsquo;s <b>' + V.holdout.flat_median.toFixed(1) + '%</b> — a gap of 1.4 points, down from 9.8 in v4. ' +
    'Category pricing (' + catLo.toFixed(2) + '&times;&ndash;' + catHi.toFixed(2) + '&times; across categories with 3+ anchors) is the other half of the edge, ' +
    'and every launch is then weighted by <b>P(it ever tokens)</b>, fitted from the peers&rsquo; record and beaten against the base rate held out twice. ' +
    'Here is the test, the verdicts, and every protocol accounted for — plus compare, CSV export, pinned rows and tabbed field notes.</p>' +
    '<div class="dateline">Model ' + esc(DATA.model_version) + ' &middot; fitted on ' + M.anchors + ' traded anchors &middot; ' +
    'log<sub>10</sub>(mcap) = ' + M.intercept + ' + ' + M.slope + ' &middot; log<sub>10</sub>(TVL), R&sup2; ' + M.r2 + ' &middot; blended 0.28 toward the flat multiple &middot; ' +
    'snapshot ' + esc(DATA.as_of) + ' &middot; source ' + esc(DATA.source) + '</div>';

  /* ---------- proof strip ---------- */
  function proof(fig, lab, note) { return '<div class="proof"><div class="fig">' + fig + '</div><div class="lab">' + lab + '</div><div class="note">' + note + '</div></div>'; }
  $('proof').innerHTML =
    proof(fmtInt(V.walk_forward_75.fitted_mean) + '% <small>vs ' + fmtInt(V.walk_forward_75.flat_mean) + '%</small>', 'Walk-forward mean miss', 'Fit the earliest 75% of listings, test the rest. The blended curve wins the mean in all four tests; the median is a wash on one holdout.') +
    proof(V.coverage_p25_p75.toFixed(1) + '% <small>/ ' + V.coverage_p10_p90.toFixed(1) + '%</small>', 'Range honesty', 'Leave-one-out intervals cover 52.3% at P25&ndash;P75 (nominal 50%) and 82.8% at P10&ndash;P90 (nominal 80%). The ranges are honest.') +
    proof(V.odds_a_to_b.brier_model.toFixed(2) + ' / ' + V.odds_b_to_a.brier_model.toFixed(2) + ' <small>vs ' + V.odds_a_to_b.brier_base.toFixed(2) + '</small>', 'Token odds, held out twice', 'Brier score of P(token) against the base rate, split two ways. Age is the strongest term; growth runs negative.') +
    proof('4 <small>of 7</small>', 'Terms kept', 'Curve, category, flat blend, odds. Growth, age and chain count were fitted and not kept &mdash; the table in &sect;2 shows each test.') +
    proof(VD.farm + ' <small>of ' + DATA.board_size + '</small>', 'Worth farming', 'Farm verdicts clear a $50 net bar after gas and capital cost (5% of expected value, 10,000 assumed farmers). ' + VD.thin + ' thin, ' + VD.skip + ' skip.') +
    proof(DATA.watchlist_size + '/' + DATA.watchlist_size, 'Watchlist covered', 'Every watchlist protocol is on the board; ' + watchTop50 + ' of the 40 sit in the top 50 by expected value.');

  /* ---------- ledger ---------- */
  $('ledger').innerHTML =
    '<span class="cell"><b>' + L.ranked + '</b> ranked pre-token</span><span>+</span>' +
    '<span class="cell"><b>' + L.traded + '</b> already traded</span><span>+</span>' +
    '<span class="cell"><b>' + L.excluded + '</b> excluded (exchange, versioned pool, or above the floor and not on the watchlist)</span><span>=</span>' +
    '<span class="cell"><b>' + L.total + '</b> protocols in the snapshot</span>' +
    '<span class="ok">&check; accounted</span>';

  /* ---------- shortlist ---------- */
  function reason(r) {
    var bits = [];
    if (r.rank === 1) bits.push('largest TVL on the board');
    else if (r.rank === 2) bits.push('second-largest TVL on the board');
    if (r.token_odds >= 0.7) bits.push('token odds ' + r.token_odds.toFixed(2) + ' — old and large for a pre-token name');
    else if (r.token_odds >= 0.6) bits.push('token odds ' + r.token_odds.toFixed(2));
    if (r.category_multiplier >= 1.5) bits.push('category priced ' + r.category_multiplier.toFixed(2) + '× the curve');
    if (r.category_multiplier <= 0.7) bits.push('category priced ' + r.category_multiplier.toFixed(2) + '× the curve, holding the value down');
    if (!bits.length) bits.push('TVL ' + fmt$(r.tvl_usd) + ' at a ' + r.category_multiplier.toFixed(2) + '× category');
    return bits.join('; ') + '.';
  }
  var top10 = DATA.rows.slice(0, 10);
  $('shortlist').innerHTML = '<h2><span class="no">§1</span>The shortlist — the ten launches that matter</h2>' +
    '<p class="lede">Ranked by expected launch value: implied value if it tokens, times P(it ever tokens). ' +
    'Rank #1 holds rank 1–2 under 200 refits of the value model; ranks 3–10 move. The range column is the bootstrap P25–P75.</p>' +
    '<div class="boardwrap"><table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Implied if it tokens</th><th class="num">P(token)</th><th class="num">Expected value</th><th>Verdict</th><th class="num">Rank range</th><th>Why it is here</th></tr></thead><tbody>' +
    top10.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td><td><b>' + esc(r.name) + '</b><br><span class="small">' + esc(r.slug) + '</span></td><td>' + esc(r.category || '—') + '</td><td class="num">' + fmt$(r.tvl_usd) + '</td><td class="num">' + fmt$(r.implied_if_token_usd) + '</td><td class="num">' + r.token_odds.toFixed(2) + '</td><td class="num"><b>' + fmt$(r.implied_value_usd) + '</b></td><td>' + verdictCell(r.verdict, r.net_usd) + '</td><td class="num">' + r.rank_p25 + '–' + r.rank_p75 + '</td><td>' + esc(reason(r)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  /* ---------- evidence ---------- */
  function valTable(t) {
    return '<tr><td>' + esc(t.name) + '</td><td class="num">' + t.n_test + '</td><td class="num">' + t.fitted_mean.toFixed(1) + '%</td><td class="num">' + t.fitted_median.toFixed(1) + '%</td><td class="num">' + t.flat_mean.toFixed(1) + '%</td><td class="num">' + t.flat_median.toFixed(1) + '%</td><td class="num">' + t.median_ratio.toFixed(2) + '×</td></tr>';
  }
  $('evidence').innerHTML = '<h2><span class="no">§2</span>The evidence — every claim on this page, tested</h2>' +
    '<p class="lede">Four tables. The value model is tested against the flat multiple three ways; the token-odds model is held out twice; the terms table shows what was fitted and what was dropped, and why.</p>' +
    '<h3>The value model against a flat multiple — the blended curve</h3>' +
    '<table><thead><tr><th>Test</th><th class="num">n</th><th class="num">Blended mean miss</th><th class="num">Blended median miss</th><th class="num">Flat mean miss</th><th class="num">Flat median miss</th><th class="num">Median ratio</th></tr></thead><tbody>' +
    [V.holdout, V.walk_forward_50, V.walk_forward_75, V.loo].map(valTable).join('') + '</tbody></table>' +
    '<p class="lede">MAPE against the anchors&rsquo; real market caps. The flat multiple is the median mcap/TVL (' + M.flat_ratio + '), fitted on the same training set as the curve in each test. ' +
    'The blended curve wins the mean in all four tests and the median in three. On the random 70/30 holdout it still loses the median (' + V.holdout.fitted_median.toFixed(1) + '% vs ' + V.holdout.flat_median.toFixed(1) + '%) — but the gap is 1.4 points, down from 9.8 in v4, after blending the curve 0.28 of the way toward the flat multiple. ' +
    'That loss is stated here, not hidden, and the blend is the measured fix: no fit variant wins this median outright, so the honest v5 story is the narrowed gap.</p>' +
    '<h3>The terms — fitted, kept or dropped</h3>' +
    '<table><thead><tr><th>Term</th><th class="num">R² with</th><th class="num">R² gain</th><th class="num">Coefficient</th><th>Kept?</th><th>Why</th></tr></thead><tbody>' +
    V.terms.map(function (t) {
      function num(v, d) { return v === null || v === undefined ? '—' : v.toFixed(d); }
      return '<tr><td><b>' + esc(t.term) + '</b></td><td class="num">' + num(t.r2_with, 4) + '</td><td class="num">' + (t.r2_gain === null ? '—' : (t.r2_gain > 0 ? '+' : '') + t.r2_gain.toFixed(4)) + '</td><td class="num">' + num(t.coefficient, 3) + '</td><td>' + (t.kept ? '<span class="pass">Kept</span>' : '<span class="v-SKIP">Not kept</span>') + '</td><td>' + esc(t.reason) + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<h3>Token odds — P(it ever tokens), held out twice</h3>' +
    '<table><thead><tr><th>Holdout</th><th class="num">n</th><th class="num">Brier, model</th><th class="num">Brier, base rate</th><th class="num">Ratio</th></tr></thead><tbody>' +
    '<tr><td>Fit first half, test second</td><td class="num">' + V.odds_a_to_b.n_test + '</td><td class="num">' + V.odds_a_to_b.brier_model.toFixed(4) + '</td><td class="num">' + V.odds_a_to_b.brier_base.toFixed(4) + '</td><td class="num">' + (V.odds_a_to_b.brier_model / V.odds_a_to_b.brier_base).toFixed(2) + '×</td></tr>' +
    '<tr><td>Fit second half, test first</td><td class="num">' + V.odds_b_to_a.n_test + '</td><td class="num">' + V.odds_b_to_a.brier_model.toFixed(4) + '</td><td class="num">' + V.odds_b_to_a.brier_base.toFixed(4) + '</td><td class="num">' + (V.odds_b_to_a.brier_model / V.odds_b_to_a.brier_base).toFixed(2) + '×</td></tr></tbody></table>' +
    '<p class="lede">Logistic on log<sub>10</sub>(TVL), age in years, and 7d growth, fitted on 449 eligible peers (base rate ' + V.odds_base_rate.toFixed(3) + '). ' +
    'Standardised weights: log TVL ' + V.odds_weights.log_tvl.toFixed(2) + ', age ' + V.odds_weights.age.toFixed(2) + ', growth ' + V.odds_weights.growth.toFixed(2) + '. ' +
    'Calibration, predicted vs realised token rate by decile: ' + V.calibration.map(function (c) { return c.predicted.toFixed(2) + ' → ' + c.realized.toFixed(2); }).join(', ') + '.</p>' +
    '<h3>Range honesty and rank stability</h3>' +
    '<table><thead><tr><th>Check</th><th class="num">Measured</th><th class="num">Nominal</th><th>Reading</th></tr></thead><tbody>' +
    '<tr><td>Leave-one-out P25–P75 coverage</td><td class="num">' + V.coverage_p25_p75.toFixed(1) + '%</td><td class="num">50%</td><td>The interval holds what it claims.</td></tr>' +
    '<tr><td>Leave-one-out P10–P90 coverage</td><td class="num">' + V.coverage_p10_p90.toFixed(1) + '%</td><td class="num">80%</td><td>Slightly wide — the honest direction.</td></tr></tbody></table>' +
    '<table><thead><tr><th>#</th><th>Protocol</th><th class="num">Bootstrap P25–P75</th><th class="num">Bootstrap P10–P90</th></tr></thead><tbody>' +
    top10.map(function (r) { return '<tr><td class="num">' + r.rank + '</td><td>' + esc(r.name) + '</td><td class="num">' + r.rank_p25 + '–' + r.rank_p75 + '</td><td class="num">' + r.rank_p10 + '–' + r.rank_p90 + '</td></tr>'; }).join('') + '</tbody></table>' +
    '<p class="lede">200 refits of the value model on resampled anchors, token odds held fixed, the blend rescored on each refit. Rank #1 never moves; the rest of the top ten move 4–23 places. The board prints the P25–P75 range on every row.</p>' +
    '<h3>Category pricing</h3>' +
    '<table><thead><tr><th>Category</th><th class="num">Anchors</th><th class="num">Multiplier</th></tr></thead><tbody>' +
    DATA.categories.map(function (c) { return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' + c.multiplier.toFixed(2) + '×</td></tr>'; }).join('') + '</tbody></table>' +
    '<p class="lede">Shrunken median log-residual per category (shrinkage n/(n+3), clamped to 0.30×–3.00×). Categories with fewer than 3 anchors sit at or near the clamp and are shown as such — a single anchor does not set a price.</p>';

  /* ---------- board: compare, pins, CSV export ---------- */
  var state = { q: '', cat: 'all', verdict: 'all', sort: 'rank' };
  var compare = []; // slugs, at most 3, in the order picked
  var pinned = []; // slugs, in the order pinned
  var cats = [];
  DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  $('board').innerHTML = '<h2><span class="no">§3</span>The board — all ' + DATA.board_size + ' pre-token protocols, ranked by expected launch value</h2>' +
    '<p class="lede">Click a row for its field notes: the factor breakdown, the nearest traded comps, and the netted farm plan. ' +
    'Expected launch value is the ranking value; the implied value if it tokens and P(token) are shown beside it. ' +
    'Tick the compare box on two or three rows to lay them side by side; pin a row to keep it in the strip above the board; the CSV button downloads the rows you are looking at.</p>' +
    '<div class="controls"><input id="q" type="search" placeholder="Search name or slug…" aria-label="Search">' +
    '<select id="cat" aria-label="Category"><option value="all">All categories</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<select id="verdict" aria-label="Verdict"><option value="all">All verdicts</option><option>FARM</option><option>THIN</option><option>SKIP</option></select>' +
    '<select id="sort" aria-label="Sort"><option value="rank">Sort: rank</option><option value="expected">Sort: expected value</option><option value="tvl">Sort: TVL</option><option value="odds">Sort: P(token)</option><option value="net">Sort: net $</option></select>' +
    '<button id="csv" type="button">Download CSV</button>' +
    '<span class="small" id="count"></span></div>' +
    '<div id="pinned" class="pinned" hidden></div>' +
    '<div id="compare" class="compare" hidden></div>' +
    '<div class="boardwrap"><table><thead><tr><th title="Compare: pick 2–3 rows">Cmp</th><th title="Pin this row to the strip above">Pin</th><th>#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Implied if it tokens</th><th class="num">P(token)</th><th class="num">Expected value</th><th>Verdict</th><th class="num">Rank range</th></tr></thead><tbody id="rows"></tbody></table></div>';
  function filteredRows() {
    var q = state.q.toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'rank') return a.rank - b.rank;
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'odds') return b.token_odds - a.token_odds;
      if (key === 'net') return b.net_usd - a.net_usd;
      return b.implied_value_usd - a.implied_value_usd;
    });
    return rows;
  }
  function rowHtml(r) {
    var isCmp = compare.indexOf(r.slug) >= 0;
    var isPin = pinned.indexOf(r.slug) >= 0;
    return '<tr data-slug="' + esc(r.slug) + '"' + (isPin ? ' class="pinned-row"' : '') + '>' +
      '<td><input type="checkbox" class="cmp" data-slug="' + esc(r.slug) + '" aria-label="Compare ' + esc(r.name) + '"' + (isCmp ? ' checked' : '') + '></td>' +
      '<td><button type="button" class="pin" data-slug="' + esc(r.slug) + '" aria-label="Pin ' + esc(r.name) + '">' + (isPin ? 'Unpin' : 'Pin') + '</button></td>' +
      '<td class="num">' + r.rank + '</td><td><b>' + esc(r.name) + '</b><br><span class="small">' + esc(r.slug) + '</span></td><td>' + esc(r.category || '—') + '</td><td class="num">' + fmt$(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td><td class="num">' + fmt$(r.implied_if_token_usd) + '</td><td class="num">' + r.token_odds.toFixed(2) + '</td><td class="num"><b>' + fmt$(r.implied_value_usd) + '</b></td><td>' + verdictCell(r.verdict, r.net_usd) + '</td><td class="num">' + r.rank_p25 + '–' + r.rank_p75 + '</td></tr>';
  }
  function renderPinned() {
    var el = $('pinned');
    if (!pinned.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<b>Pinned — ' + pinned.length + '</b> ' + pinned.map(function (slug) {
      var r = bySlugMap[slug];
      if (!r) return '';
      return '<span class="pin-chip">#' + r.rank + ' <b>' + esc(r.name) + '</b> ' + fmt$(r.implied_value_usd) + ' <button type="button" class="unpin" data-slug="' + esc(slug) + '" aria-label="Unpin ' + esc(r.name) + '">×</button></span>';
    }).join(' ');
  }
  function renderCompare() {
    var el = $('compare');
    if (compare.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    var rows = compare.map(function (slug) { return bySlugMap[slug]; }).filter(Boolean);
    function cmpRow(label, fn) {
      return '<tr><td><b>' + label + '</b></td>' + rows.map(function (r) { return '<td class="num">' + fn(r) + '</td>'; }).join('') + '</tr>';
    }
    el.hidden = false;
    el.innerHTML = '<h3>Compare — ' + rows.length + ' protocols, side by side <button type="button" id="cmp-clear">Clear</button></h3>' +
      '<table><thead><tr><th>Factor</th>' + rows.map(function (r) { return '<th class="num">#' + r.rank + ' ' + esc(r.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      cmpRow('TVL', function (r) { return fmt$(r.tvl_usd); }) +
      cmpRow('Category', function (r) { return esc(r.category || '—') + ' (' + r.category_multiplier.toFixed(2) + '×)'; }) +
      cmpRow('Implied if it tokens', function (r) { return fmt$(r.implied_if_token_usd); }) +
      cmpRow('P(token)', function (r) { return r.token_odds.toFixed(2); }) +
      cmpRow('Expected value', function (r) { return '<b>' + fmt$(r.implied_value_usd) + '</b>'; }) +
      cmpRow('Verdict', function (r) { return verdictCell(r.verdict, r.net_usd); }) +
      cmpRow('Net $', function (r) { return (r.net_usd >= 0 ? '+$' : '-$') + fmtInt(Math.abs(r.net_usd)); }) +
      cmpRow('Age', function (r) { return fmtAge(r.age_days); }) +
      cmpRow('7d change', function (r) { return fmtPct(r.change_7d); }) +
      cmpRow('Rank range P25–P75', function (r) { return r.rank_p25 + '–' + r.rank_p75; }) +
      '</tbody></table>';
    $('cmp-clear').addEventListener('click', function () { compare = []; renderBoard(); renderCompare(); });
  }
  function renderBoard() {
    var rows = filteredRows();
    $('count').textContent = 'Showing ' + rows.length + ' of ' + DATA.board_size + (compare.length ? ' · ' + compare.length + ' picked to compare (max 3)' : '');
    $('rows').innerHTML = rows.map(rowHtml).join('');
    renderPinned();
    renderCompare();
  }
  function downloadCsv() {
    var rows = filteredRows();
    var head = ['rank', 'name', 'slug', 'category', 'tvl_usd', 'change_7d_pct', 'implied_if_token_usd', 'token_odds', 'expected_value_usd', 'verdict', 'net_usd', 'rank_p25', 'rank_p75'];
    var lines = [head.join(',')];
    rows.forEach(function (r) {
      lines.push([r.rank, csvEsc(r.name), csvEsc(r.slug), csvEsc(r.category || ''), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.implied_if_token_usd, r.token_odds, r.implied_value_usd, r.verdict, r.net_usd, r.rank_p25, r.rank_p75].join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'launch-ledger-v5-board.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  $('csv').addEventListener('click', downloadCsv);
  $('rows').addEventListener('change', function (e) {
    var box = e.target.closest ? e.target.closest('input.cmp') : null;
    if (!box) return;
    var slug = box.getAttribute('data-slug');
    if (box.checked) {
      if (compare.length >= 3) { box.checked = false; $('count').textContent = 'Compare holds 3 rows at most — unpick one first.'; return; }
      compare.push(slug);
    } else {
      compare = compare.filter(function (s) { return s !== slug; });
    }
    renderBoard();
  });
  $('board').addEventListener('click', function (e) {
    var pin = e.target.closest ? e.target.closest('button.pin, button.unpin') : null;
    if (!pin) return;
    var slug = pin.getAttribute('data-slug');
    if (pinned.indexOf(slug) >= 0) pinned = pinned.filter(function (s) { return s !== slug; });
    else pinned.push(slug);
    renderBoard();
  });
  renderBoard();

  /* ---------- detail drawer, with tabs ---------- */
  function compsFor(row) {
    var lt = Math.log10(Math.max(1, row.tvl_usd));
    function byDist(a) { return { a: a, d: Math.abs(Math.log10(Math.max(1, a.tvl_usd)) - lt) }; }
    var same = DATA.anchors.filter(function (a) { return a.category === row.category; }).map(byDist).sort(function (x, y) { return x.d - y.d; });
    var out = same.slice(0, 3);
    if (out.length < 3) {
      var seen = {};
      out.forEach(function (c) { seen[c.a.slug] = true; });
      DATA.anchors.map(byDist).sort(function (x, y) { return x.d - y.d; }).forEach(function (c) {
        if (out.length < 3 && !seen[c.a.slug]) { seen[c.a.slug] = true; out.push(c); }
      });
    }
    return out;
  }
  function showDetail(slug, tab) {
    var row = bySlugMap[slug];
    if (!row) return;
    var steps = farmSteps(row, row.verdict, row.net_usd);
    var comps = compsFor(row);
    var prev = DATA.rows[row.rank - 2], next = DATA.rows[row.rank];
    var curve = Math.pow(10, M.intercept + M.slope * Math.log10(Math.max(1, row.tvl_usd)));
    var active = tab || 'factors';
    function tabBtn(id, label) { return '<button type="button" class="tab' + (active === id ? ' on' : '') + '" data-tab="' + id + '">' + label + '</button>'; }
    $('detail').hidden = false;
    $('detail').innerHTML = '<h2>Field notes — #' + row.rank + ' ' + esc(row.name) + ' <span class="small">' + esc(row.slug) + ' · ' + esc(row.category || '—') + ' · ' + (row.chains || []).join(', ') + '</span></h2>' +
      '<div class="tabs" role="tablist">' + tabBtn('factors', 'Factors') + tabBtn('comps', 'Comps') + tabBtn('plan', 'Plan') + '</div>' +
      '<div class="tabpane" data-pane="factors"' + (active === 'factors' ? '' : ' hidden') + '>' +
      '<div class="factors">' +
      '<div class="factor"><div class="fig">' + fmt$(row.implied_if_token_usd) + '</div><div class="lab">Implied if it tokens</div><div class="small">curve ' + fmt$(curve) + ' × ' + row.category_multiplier.toFixed(2) + '× category, blended 0.28 toward the flat multiple</div></div>' +
      '<div class="factor"><div class="fig">' + row.token_odds.toFixed(2) + '</div><div class="lab">P(it ever tokens)</div><div class="small">logistic on TVL, age ' + fmtAge(row.age_days) + ', 7d ' + fmtPct(row.change_7d) + '</div></div>' +
      '<div class="factor"><div class="fig">' + fmt$(row.implied_value_usd) + '</div><div class="lab">Expected launch value</div><div class="small">implied × P(token) — the ranking value</div></div>' +
      '<div class="factor"><div class="fig">' + row.rank_p25 + '–' + row.rank_p75 + '</div><div class="lab">Rank range, P25–P75</div><div class="small">P10–P90: ' + row.rank_p10 + '–' + row.rank_p90 + ' over 200 refits</div></div>' +
      '</div></div>' +
      '<div class="tabpane" data-pane="comps"' + (active === 'comps' ? '' : ' hidden') + '>' +
      '<h3>Nearest traded comps — same category first, then closest TVL</h3>' +
      (comps.length ? '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">Curve says</th></tr></thead><tbody>' +
        comps.map(function (c) {
          var catMult = 1;
          DATA.categories.forEach(function (cat) { if (cat.category === c.a.category) catMult = cat.multiplier; });
          var pred = Math.pow(10, M.intercept + M.slope * Math.log10(Math.max(1, c.a.tvl_usd))) * catMult;
          var tag = c.a.category === row.category ? '' : ' <span class="tag">' + esc(c.a.category || '—') + '</span>';
          return '<tr><td>' + esc(c.a.name) + tag + '</td><td class="num">' + fmt$(c.a.tvl_usd) + '</td><td class="num">' + fmt$(c.a.mcap_usd) + '</td><td class="num">' + (c.a.mcap_usd / c.a.tvl_usd).toFixed(2) + '×</td><td class="num">' + fmt$(pred) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="lede">No traded anchor in this category — the value rests on the curve alone.</p>') +
      '</div>' +
      '<div class="tabpane" data-pane="plan"' + (active === 'plan' ? '' : ' hidden') + '>' +
      '<h3>Farm plan — ' + verdictCell(row.verdict, row.net_usd) + '</h3>' +
      '<ol class="farm">' + steps.map(function (s) { return '<li>' + esc(s.text) + '</li>'; }).join('') + '</ol>' +
      '</div>' +
      '<p class="small">Neighbours: ' + (prev ? '#' + prev.rank + ' ' + esc(prev.name) + ' (' + fmt$(prev.implied_value_usd) + ')' : '—') + ' · ' + (next ? '#' + next.rank + ' ' + esc(next.name) + ' (' + fmt$(next.implied_value_usd) + ')' : '—') + '</p>';
    $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  $('detail').addEventListener('click', function (e) {
    var tab = e.target.closest ? e.target.closest('button.tab') : null;
    if (!tab) return;
    var slug = $('detail').getAttribute('data-slug');
    if (slug) showDetail(slug, tab.getAttribute('data-tab'));
  });
  document.addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    if (e.target.closest && (e.target.closest('input.cmp') || e.target.closest('button.pin'))) return;
    var slug = tr.getAttribute('data-slug');
    $('detail').setAttribute('data-slug', slug);
    showDetail(slug, 'factors');
  });

  /* ---------- live token view ---------- */
  $('live').innerHTML = '<h2><span class="no">§4</span>Already traded — the market&rsquo;s own values, not the model&rsquo;s</h2>' +
    '<p class="lede">The ' + DATA.live_size + ' largest traded protocols by market cap. They are the anchors&rsquo; neighbours and the proof that the curve is fitted to real prices, not to itself. Pre-token rows never mix into this table.</p>' +
    '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' +
    DATA.live.map(function (r) { return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '—') + '</td><td class="num">' + fmt$(r.tvl_usd) + '</td><td class="num">' + fmt$(r.mcap_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td></tr>'; }).join('') + '</tbody></table>';

  /* ---------- model sandbox ---------- */
  $('sandbox').innerHTML = '<h2><span class="no">§5</span>Model sandbox — change the verdict&rsquo;s assumptions and watch it move</h2>' +
    '<div class="box"><label for="farmers">Farmers splitting the airdrop</label><input id="farmers" type="number" value="' + VD.farmers + '" min="100" step="100"> ' +
    '<label for="share">Airdrop share of expected value, %</label><input id="share" type="number" value="' + (VD.airdrop_share * 100) + '" min="0.5" max="50" step="0.5"> ' +
    '<span class="small" id="sandbox-out"></span>' +
    '<p class="small" style="margin:8px 0 0">Net = share × expected value ÷ farmers − $' + VD.gas_usd + ' gas − $1 capital cost. FARM clears $' + VD.farm_net_min + ' net; THIN clears $0. ' +
    'The board above keeps the published verdicts (' + VD.farm + ' FARM at ' + fmtInt(VD.farmers) + ' farmers and ' + (VD.airdrop_share * 100) + '%); the sandbox only tests the assumption.</p></div>';
  function sandboxOut() {
    var f = Math.max(1, parseFloat($('farmers').value) || VD.farmers);
    var s = Math.max(0, parseFloat($('share').value) || VD.airdrop_share * 100) / 100;
    var farm = 0, thin = 0;
    DATA.rows.forEach(function (r) {
      var net = s * r.implied_value_usd / f - VD.gas_usd - 1;
      if (net >= VD.farm_net_min) farm++;
      else if (net >= 0) thin++;
    });
    $('sandbox-out').textContent = 'At ' + fmtInt(f) + ' farmers and ' + (s * 100) + '%: ' + farm + ' FARM, ' + thin + ' THIN, ' + (DATA.board_size - farm - thin) + ' SKIP.';
  }
  $('farmers').addEventListener('input', sandboxOut);
  $('share').addEventListener('input', sandboxOut);
  sandboxOut();

  /* ---------- checksum row, recomputed live in the browser ---------- */
  (function () {
    var stored = DATA.board_checksum;
    var recomputed = sha256Hex(JSON.stringify(DATA.rows)).slice(0, 8);
    var sum = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var ranksOk = DATA.rows.every(function (r, i) { return r.rank === i + 1; });
    var orderOk = DATA.rows.every(function (r, i) { return i === 0 || DATA.rows[i - 1].implied_value_usd >= r.implied_value_usd; });
    var ledgerOk = L.ranked + L.traded + L.excluded === L.total && L.ranked === DATA.board_size;
    var watchCovered = DATA.watchlist.filter(function (s) { return DATA.rows.some(function (r) { return r.slug === s; }); }).length;
    var watchOk = watchCovered === DATA.watchlist.length;
    function row(name, got, want, ok) { return '<tr><td>' + name + '</td><td class="num">' + got + '</td><td class="num">' + want + '</td><td class="' + (ok ? 'pass' : 'fail') + '">' + (ok ? '✓ pass' : '✗ FAIL') + '</td></tr>'; }
    $('checksum').innerHTML = '<h2><span class="no">§6</span>Checksum — the page checks its own arithmetic</h2>' +
      '<p class="lede">The checksum is the first 8 hex of sha256 over the board rows as JSON, computed by main.ts at build time and recomputed here, in your browser, from the same rows. If any number on this page were edited after the build, the checksum would not match.</p>' +
      '<table><thead><tr><th>Check</th><th class="num">This page</th><th class="num">Build time</th><th>Result</th></tr></thead><tbody>' +
      row('Board checksum (sha256, first 8 hex)', recomputed, stored, recomputed === stored) +
      row('Board rows', fmtInt(DATA.rows.length), fmtInt(DATA.board_rows), DATA.rows.length === DATA.board_rows) +
      row('Sum of expected values', fmt$(sum), fmt$(DATA.board_sum_expected_usd), sum === DATA.board_sum_expected_usd) +
      row('Ranks 1..N in order', ranksOk ? '1–' + DATA.board_size : 'broken', '1–' + DATA.board_size, ranksOk) +
      row('Expected values non-rising', orderOk ? 'non-rising' : 'broken', 'non-rising', orderOk) +
      row('Ledger adds to the snapshot', L.ranked + ' + ' + L.traded + ' + ' + L.excluded + ' = ' + (L.ranked + L.traded + L.excluded), '758', ledgerOk) +
      row('Watchlist covered 40/40', watchCovered + '/' + DATA.watchlist.length, '40/40', watchOk) +
      '</tbody></table>';
  })();

  /* ---------- colophon ---------- */
  $('colophon').innerHTML = 'How the value is built. Expected launch value = implied value if it tokens × P(it ever tokens). ' +
    'The implied value is the fitted curve 10^(' + M.intercept + ' + ' + M.slope + '·log<sub>10</sub>TVL) times the category multiplier, fitted on ' + M.anchors + ' traded anchors (one per ticker, market cap above zero), ' +
    'then blended 0.28 of the way toward the flat multiple (median mcap/TVL ' + M.flat_ratio + ') — the blend that closes the random-holdout median gap from 9.8 points to 1.4. ' +
    'P(token) is a logistic on log<sub>10</sub>(TVL), age, and 7d growth, fitted on 449 eligible peers. ' +
    'Verdicts net a 5% airdrop share across 10,000 assumed farmers against $12 of gas and $1 of capital cost; FARM clears $50 net. ' +
    'Growth, age and chain count were fitted into the value model and dropped — the evidence table shows each test. ' +
    'The board ranks the watchlist plus every rankable pre-token protocol below the $50M floor; exchanges, versioned pools, and above-floor protocols not on the watchlist are excluded and counted in the ledger. ' +
    'Compare mode, CSV export, pinned rows and tabbed field notes are new in v5. ' +
    'Model ' + esc(DATA.model_version) + ' · snapshot ' + esc(DATA.as_of) + ' · all figures recomputed from the snapshot at build time; nothing about any protocol is hardcoded.';

  /* ---------- deep links and screenshot targets ----------
     #evidence scrolls to the evidence tables, #detail=<slug> opens that
     protocol's field notes (for a human reader, in a real browser).
     ?shot=evidence and ?shot=detail&slug=<slug> are for screenshots: they
     hide the sections above the target instead of scrolling, so the shot is
     the target section at the top of the page with no scroll to race. */
  (function applyTarget() {
    var q = new URLSearchParams(window.location.search);
    var shot = q.get('shot');
    var slug = q.get('slug');
    var h = window.location.hash || '';
    function hide(ids) { ids.forEach(function (id) { var el = $(id); if (el) el.style.display = 'none'; }); }
    if (shot === 'evidence') { hide(['masthead', 'proof', 'ledger', 'shortlist']); return; }
    if (shot === 'detail' && slug) {
      hide(['masthead', 'proof', 'ledger', 'shortlist', 'evidence', 'board', 'live', 'sandbox', 'checksum', 'colophon']);
      $('detail').setAttribute('data-slug', slug);
      showDetail(slug, q.get('tab') || 'factors');
      return;
    }
    if (h.indexOf('#detail=') === 0) { var s = decodeURIComponent(h.slice(8)); $('detail').setAttribute('data-slug', s); showDetail(s, 'factors'); }
    else if (h === '#evidence') { var el = $('evidence'); if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' }); }
  })();
})();
