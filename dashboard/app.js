// Token Radar dashboard, radar-2. A static page with no network: it reads
// window.RADAR (written beside dashboard/ by main.ts) and renders the ranked
// board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, a live-token view, and a panel showing
// the category comparables behind every implied value. No framework, no fetch:
// every byte it shows is in data.js.
(() => {
  'use strict';

  const DATA = window.RADAR;
  const app = document.getElementById('board');
  if (!DATA || !app) return;

  const state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function money(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }

  function pct(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, recomputed in the page from the snapshot figures, so the number
  // the detail view shows is the same arithmetic board.json carries. The
  // category multiple is per row: the shrunk median market-cap/TVL of
  // live-token peers in the row's category, carried in the row itself.
  function impliedOf(row, model) {
    const rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    const growthMult = 1 + (growth / 100) * model.growth_weight;
    const age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    const maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    const multiple = row.category_multiple === null || row.category_multiple === undefined ? 0.2 : row.category_multiple;
    return Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity));
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased. The page prefers the plan data.js
  // carries (identical to board.json by construction) and falls back to
  // recomputing it, so the detail view never shows a different plan.
  const chainOf = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');
  const secondChainOf = (p) => (p.chains && p.chains.length > 1 ? p.chains[1] : null);

  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function actionFor(p, capital, chain) {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
    if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }

  function weeklyFor(p, chain) {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    const second = secondChainOf(p);
    const elsewhere = second === null ? '' : `, or the same on ${second}`;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $10 against the supply on ${name} and repay it the same week, so the position shows both sides of the market${elsewhere}.`;
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $10 through ${name}'s main pool on ${chain}${elsewhere}, so the position shows trading as well as liquidity.`;
    if (c.includes('bridge')) return `Bridge $10 back and forth through ${name} once a week, in small amounts, so the activity is steady rather than one burst.`;
    if (c.includes('staking') || c.includes('restak')) return `Claim or restake the week's rewards through ${name} once a week, even a small amount, so the stake shows activity.`;
    if (c.includes('perpetual') || c.includes('derivative')) return `Close and reopen the hedge on ${name} once a week at a small size, so the account shows regular use.`;
    if (c.includes('prediction')) return `Settle one small market position on ${name} each week, win or lose, so the account shows regular use.`;
    if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Check the vault's allocation on ${name} once a week and rebalance $10 into its newest vault${elsewhere} when one opens.`;
    if (c.includes('stable')) return `Swap $10 in and out of the stable asset through ${name} once a week, so the account shows regular use.`;
    if (c.includes('rwa')) return `Check the yield asset's accrual on ${name} once a week and record the week's yield in the farm log.`;
    return `Make one qualifying action each week on ${name}, such as a deposit, a swap or a vote${elsewhere}.`;
  }

  function stepText(step) {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600) s = `${s.slice(0, 596)}...`;
    if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
    return s;
  }

  function farmSteps(p) {
    const chain = chainOf(p);
    const capital = capitalFor(p);
    const hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Withdraw $10 first as a test, and only then unwind the rest; if the claim page asks for a fee or a new token approval, stop and check the protocol\'s own announcements.', cost: 'about $2 of gas for the test withdrawal', time: '10 minutes' },
    ].map(stepText);
  }

  function readHash() {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    const q = state.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function sortedRows(list) {
    const key = state.sort;
    const val = (r) => {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      if (key === 'multiple') return r.category_multiple;
      return r.implied_value_usd;
    };
    return list.slice().sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // Category comparables, grouped from the rows themselves: each row carries
  // its category's multiple, peer count and raw median, so the panel shows
  // exactly what the model used, per category, with no extra data.
  function peerGroups() {
    const byCat = new Map();
    for (const r of DATA.rows) {
      const cat = r.category || 'Other';
      if (!byCat.has(cat)) {
        byCat.set(cat, { category: cat, rows: 0, multiple: r.category_multiple, peers: r.category_peers, median: r.category_median ?? null });
      }
      byCat.get(cat).rows += 1;
    }
    return [...byCat.values()].sort((a, b) => b.rows - a.rows);
  }

  const sortArrow = (key) => (state.sort === key ? (state.dir < 0 ? ' v' : ' ^') : '');

  function headerHtml() {
    return `<header class="top">
      <div class="brand"><span class="mark"></span><span class="brand-name">Token Radar</span></div>
      <div class="top-meta"><span>Snapshot ${esc(DATA.as_of)}</span><span>DefiLlama protocol index</span><span>${esc(DATA.model_version)} model</span></div>
    </header>`;
  }

  function ledeHtml() {
    return `<section class="lede"><div>
      <h1>${DATA.watchlist_size} watchlist protocols, ranked by implied value</h1>
      <p>The watchlist is the floor: every protocol with at least $${Math.round(DATA.floor_usd / 1e6)}M of TVL and no token on record. The early radar adds ${DATA.early_size} pre-token protocols below that floor. Implied value is a model, not a promise.</p>
    </div><div class="facts">
      <div class="fact"><span>Watchlist covered</span><b>${DATA.watchlist_size} / ${DATA.watchlist_size}</b></div>
      <div class="fact"><span>Pre-token rows scored</span><b>${DATA.board_size}</b></div>
      <div class="fact"><span>Early rows below the floor</span><b>${DATA.early_size}</b></div>
      <div class="fact"><span>Live-token protocols set aside</span><b>${DATA.live_size}</b></div>
    </div></section>`;
  }

  function controlsHtml() {
    const categories = [...new Set(DATA.rows.map((r) => r.category || 'Other'))].sort();
    const chains = [...new Set(DATA.rows.flatMap((r) => r.chains || []))].sort();
    const catOpts = ['<option value="all">All categories</option>', ...categories.map((c) => `<option value="${esc(c)}"${c === state.category ? ' selected' : ''}>${esc(c)}</option>`)].join('');
    const chainOpts = ['<option value="all">All chains</option>', ...chains.map((c) => `<option value="${esc(c)}"${c === state.chain ? ' selected' : ''}>${esc(c)}</option>`)].join('');
    const shown = state.tab === 'pre-token' ? `${visibleRows().length} rows shown` : `${DATA.live.length} live-token protocols`;
    return `<div class="controls">
      <div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="${esc(state.q)}" aria-label="Search the board"></div>
      <div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">${catOpts}</select></div>
      <div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">${chainOpts}</select></div>
      <div class="field"><span class="sub">Token status</span><div class="tabs">
        <button type="button" data-tab="pre-token" aria-pressed="${state.tab === 'pre-token'}">Pre-token</button>
        <button type="button" data-tab="live" aria-pressed="${state.tab === 'live'}">Live token</button>
      </div></div>
      <span class="count">${esc(shown)}</span>
    </div>`;
  }

  function boardHtml() {
    const list = sortedRows(visibleRows());
    if (list.length === 0) {
      return `<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>
        <p>Clear the search or pick another category to see the board again.</p>
        <button class="button primary" type="button" data-clear="1">Clear filters</button></div></div>`;
    }
    const max = list[0].implied_value_usd || 1;
    const th = (key, label) => `<th scope="col"><button type="button" data-sort="${key}">${esc(label)}${sortArrow(key) ? `<span aria-hidden="true">${sortArrow(key)}</span>` : ''}</button></th>`;
    const rowsHtml = list.map((r) => {
      const growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      const width = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return `<tr data-slug="${esc(r.slug)}" data-selected="${state.selected === r.slug}" tabindex="0">
        <td class="num">${r.rank}</td>
        <td><div class="name"><b>${esc(r.name)}</b><span class="sub">${esc(r.category || 'Other')} on ${esc(chains)}</span></div></td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num ${growthClass}">${growth}</td>
        <td class="num">${ageLabel(r.age_days)}</td>
        <td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:${width}%"></i></div><span class="num">${money(r.implied_value_usd)}</span></div></td>
        <td><span class="status">no token</span></td>
      </tr>`;
    }).join('');
    return `<div class="panel"><div class="table-wrap"><table>
      <caption class="sub">Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>
      <thead><tr>${th('implied', 'Rank')}${th('name', 'Protocol')}${th('tvl', 'TVL')}${th('growth', '7d')}${th('age', 'Age')}${th('implied', 'Implied value')}<th scope="col">Token</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div></div>`;
  }

  function liveHtml() {
    const rowsHtml = DATA.live.map((r) => {
      const chains = r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain';
      const cls = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      return `<tr><td class="num">live</td>
        <td><div class="name"><b>${esc(r.name)}</b><span class="sub">${esc(r.category || 'Other')} on ${esc(chains)}</span></div></td>
        <td class="num">${money(r.tvl_usd)}</td><td class="num ${cls}">${pct(r.change_7d)}</td>
        <td class="num">${money(r.mcap_usd)}</td><td><span class="status">already trades</span></td></tr>`;
    }).join('');
    return `<div class="panel"><div class="table-wrap"><table>
      <caption class="sub">Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>
      <thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div></div>`;
  }

  function peersHtml() {
    const groups = peerGroups();
    const rowsHtml = groups.map((g) => {
      const median = g.median === null ? 'global median' : g.median.toFixed(3);
      return `<tr><td>${esc(g.category)}</td><td class="num">${g.rows}</td><td class="num">${g.peers}</td>
        <td class="num">${median}</td><td class="num">${Number(g.multiple).toFixed(3)}</td></tr>`;
    }).join('');
    return `<section class="panel model"><h2>What the market pays, by category</h2>
      <p class="sub">Each category's multiple is the median market-cap / TVL of its live-token peers, shrunk toward the global median and clipped to [${DATA.model.multiple_floor}, ${DATA.model.multiple_cap}]. A category with fewer than ${DATA.model.peer_min} live peers uses the global median: that is why some rows share one multiple.</p>
      <div class="table-wrap"><table>
      <thead><tr><th scope="col">Category</th><th scope="col">Board rows</th><th scope="col">Live peers</th><th scope="col">Peer median</th><th scope="col">Multiple used</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div></section>`;
  }

  function modelHtml() {
    const m = DATA.model;
    return `<section class="panel model"><h2>How implied value is computed</h2>
      <p class="sub">Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>
      <div class="formula">implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) )</div>
      <p class="sub">The category multiple is the market itself: the median market-cap / TVL of live-token protocols in the same category, shrunk toward the global median and clipped to [${m.multiple_floor}, ${m.multiple_cap}]; a category with fewer than ${m.peer_min} live peers uses the global median, and exchanges are never peers. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ${m.unknown_age_days} days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.</p>
    </section>`;
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.setAttribute('aria-labelledby', 'detail-title');
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  function openDetail(slug) {
    const row = DATA.rows.find((r) => r.slug === slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    const steps = row.farm_steps && row.farm_steps.length ? row.farm_steps : farmSteps(row);
    const recomputed = impliedOf(row, DATA.model);
    const multiple = row.category_multiple === null || row.category_multiple === undefined ? 'n/a' : Number(row.category_multiple).toFixed(3);
    const peers = `${row.category_peers} live peer${row.category_peers === 1 ? '' : 's'}`;
    const stepsHtml = steps.map((s) => {
      const at = s.indexOf(' Cost: ');
      const action = at >= 0 ? s.slice(0, at) : s;
      const tail = at >= 0 ? s.slice(at + 1) : '';
      return `<li><b>${esc(action)}</b><span class="cost">${esc(tail)}</span></li>`;
    }).join('');
    dialog.innerHTML = `<div class="detail-head"><div>
      <span class="brand-name">Rank ${row.rank} of ${DATA.board_size}</span>
      <h2 id="detail-title">${esc(row.name)}</h2>
      <p class="sub">${esc(row.category || 'Other')} on ${esc((row.chains || []).join(', ') || 'an unnamed chain')}</p>
    </div><button class="close" type="button" aria-label="Close details" data-close="1">Close</button></div>
    <section class="detail-section"><h3>Implied value</h3>
      <div class="equation">
        <div><span>TVL</span><b class="num">${money(row.tvl_usd)}</b></div>
        <div><span>Category multiple</span><b class="num">${multiple} (${peers})</b></div>
        <div><span>Seven-day growth</span><b class="num">${pct(row.change_7d)}</b></div>
        <div><span>Age with no token</span><b class="num">${ageLabel(row.age_days)}</b></div>
        <div><span>Growth multiplier</span><b class="num">${row.growth_multiplier}</b></div>
        <div><span>Maturity multiplier</span><b class="num">${row.maturity_multiplier}</b></div>
        <div><span>Implied value</span><b class="num">${money(row.implied_value_usd)}</b></div>
      </div>
      <p class="sub">Model ${esc(DATA.model_version)}: the same function scores every protocol. The page recomputes this row as ${money(recomputed)}${recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.'} This is an estimate, not a price.</p>
    </section>
    <section class="detail-section"><h3>Farm plan</h3><ol class="steps">${stepsHtml}</ol></section>`;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'shell';
    shell.innerHTML = headerHtml() + ledeHtml() + controlsHtml()
      + (state.tab === 'pre-token' ? boardHtml() : liveHtml())
      + (state.tab === 'pre-token' ? peersHtml() + modelHtml() : '');
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  // One listener for the whole page: sort headers, row clicks, tabs, the
  // clear-filters button and the dialog's close button all flow through it.
  app.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      render();
      return;
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { state.tab = tabBtn.getAttribute('data-tab'); render(); return; }
    if (e.target.closest('[data-clear]')) { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); return; }
    if (e.target.closest('[data-close]')) { dialog.close(); return; }
    const row = e.target.closest('tr[data-slug]');
    if (row) openDetail(row.getAttribute('data-slug'));
  });

  app.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      openDetail(e.target.getAttribute('data-slug'));
    }
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'q') { state.q = e.target.value; writeHash(); render(); }
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'category') { state.category = e.target.value; writeHash(); render(); }
    if (e.target.id === 'chain') { state.chain = e.target.value; writeHash(); render(); }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });

  readHash();
  render();
})();
