/* Crown & Core v3 — book controller. No dependencies.
   Two presentations of the same live-text pages:
   • spread  — large landscape windows: two-page book, CSS 3D leaf turn (transform/opacity only)
   • reader  — phones/tablets/small windows: native horizontal scroll-snap pager (browser scroll physics, never intercepted)
*/
(() => {
  'use strict';
  if (/[?&]measure\b/.test(location.search)) { document.documentElement.classList.add('measure'); return; }
  const doc = document, body = doc.body;
  const pagesBox = doc.getElementById('pages');
  const stage = doc.getElementById('stage');
  const canon = [...pagesBox.querySelectorAll(':scope > .page')];   // canonical pages (print / spread pagination)
  const canonN = canon.length;
  const S = Math.ceil(canonN / 2);             // sheets in spread mode
  let pages = canon, N = canonN;               // pages / count of the CURRENT mode (reader re-flows to the screen)
  const store = doc.createDocumentFragment();  // canonical pages live here while the reader is mounted
  const kind = p => p.classList.contains('cover') ? 'cover' : p.classList.contains('back') ? 'back' : p.classList.contains('blank') ? 'blank' : 'text';
  const canonBlocks = canon.map(p => kind(p) === 'text' ? [...p.querySelector('.page-inner').children] : null);
  let rmeta = [];                              // reader page index (1-based) -> {n,b} first source block
  let readerOfCanon = [], canonOfReader = [];  // mappings between the two paginations
  let layoutW = 0, layoutH = 0;
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const spreadMq = matchMedia('(min-width: 1280px) and (min-height: 800px) and (orientation: landscape)');
  const prevBtns = [...doc.querySelectorAll('[data-prev]')];
  const nextBtns = [...doc.querySelectorAll('[data-next]')];
  const label = doc.getElementById('progress-label');
  const bar = doc.getElementById('progress-bar');
  const live = doc.getElementById('live');
  const secEl = doc.getElementById('progress-sec');
  const tocSheet = doc.getElementById('toc-sheet');
  const tocBtn = doc.getElementById('toc-btn');
  const TURN_MS = 950;

  let mode = null, cur = 1, k = 0;             // cur = page shown (reader) / right page of spread; k = sheets turned
  let book = null, sheets = [], reader = null, raf = 0, idleT = 0, lockT = 0, lockScroll = false;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => reduceMq.matches;
  const pageFromHash = () => { const m = /^#p(\d+)$/.exec(location.hash); return m ? clamp(+m[1], 1, canonN) : 1; };   // hashes are canonical page numbers
  const txtOf = e => e.textContent.replace(/\s+/g, ' ').trim();
  // sections and groups come from the printed contents (the single source): canonical start page -> title, title -> group label
  doc.body.classList.add('intro'); setTimeout(() => doc.body.classList.remove('intro'), 1400);   // the cover arrives once
  const signUrl = ((doc.querySelector('meta[name="sign-url"]') || {}).content || '').trim();   // DocuSign PowerForm link; empty = the sign step stays hidden
  if (signUrl) canon.forEach(p => p.querySelectorAll('.sign-cta').forEach(c => { c.hidden = false; c.querySelector('a').href = signUrl; }));
  const sectionStarts = [], groupOf = {};
  canon.forEach(p => { let g = ''; p.querySelectorAll('.page-inner > h2.toc-group, .page-inner > ul.toc').forEach(e => { if (e.tagName === 'H2') g = txtOf(e); else e.querySelectorAll('a[data-goto]').forEach(a => { const c = a.cloneNode(true); c.querySelectorAll('.toc-n').forEach(x => x.remove()); const t = txtOf(c); sectionStarts.push({ n: +a.dataset.goto, t }); groupOf[t] = g; }); }); });
  canon.forEach((p, i) => { const f = p.querySelector('.page-inner > :first-child'); if (f && f.tagName === 'H2' && txtOf(f) === 'Review Period') sectionStarts.push({ n: i + 1, t: 'Review Period' }); if (f && f.tagName === 'H1' && txtOf(f) === 'Talk to Us') sectionStarts.push({ n: i + 1, t: 'Talk to Us' }); });   // a section with no printed-contents entry
  sectionStarts.sort((a, b) => a.n - b.n);
  const sectionOfCanon = n => { if (n <= 1) return ''; let t = 'Contents'; for (const s of sectionStarts) if (s.n <= n) t = s.t; return t; };
  const POS_KEY = 'crown-core-v3-place';
  const savePlace = a => { try { if (!a) return; if (a.n > 1 && a.n < canonN) localStorage.setItem(POS_KEY, JSON.stringify({ n: a.n, b: a.b || 0 })); else localStorage.removeItem(POS_KEY); } catch (_) {} };   // cover / back cover = start over next time
  const loadPlace = () => { try { const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); return v && v.n > 1 && v.n < canonN ? { n: v.n | 0, b: v.b | 0 } : null; } catch (_) { return null; } };
  const kFromPage = p => p <= 1 ? 0 : (p >= canonN ? S : Math.floor(p / 2));   // spread k such that page p is visible

  /* ───────── reader re-flow: pack the locked copy into pages that fit THIS screen ───────── */
  const probeEl = (h) => { const e = doc.createElement('div'); e.setAttribute('aria-hidden', 'true'); e.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:' + h; return e; };
  function frameHeight() {
    // lay out against the SMALL viewport so a collapsing mobile URL bar never forces a re-flow
    const a = probeEl('100vh'), b = probeEl('100dvh'); b.style.height = '100vh'; b.style.height = '100dvh'; a.style.height = '100vh'; a.style.height = '100svh';
    doc.body.append(a, b); const sv = a.getBoundingClientRect().height, dv = b.getBoundingClientRect().height; a.remove(); b.remove();
    return Math.max(120, Math.round(reader.clientHeight - Math.max(0, dv - sv)));
  }
  const isHead = e => /^H[12]$/.test(e.tagName) || e.classList.contains('eyebrow') || e.classList.contains('dek') || e.classList.contains('lede') || e.classList.contains('money') || e.classList.contains('allin') || e.classList.contains('party') || e.classList.contains('tline');
  const isGlue = e => e.classList.contains('paybar') || e.classList.contains('pay') || e.classList.contains('party') || e.classList.contains('rep') || e.classList.contains('sigline') || e.classList.contains('field');

  function enhancePhases(box) {                     // reader only: phase headings become tab buttons (same words, no copies)
    box.querySelectorAll('.phase-h').forEach(h => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'phase-btn'; b.setAttribute('aria-expanded', h.classList.contains('on') ? 'true' : 'false'); b.textContent = h.textContent; h.replaceChildren(b); });
  }
  function groupsOf(n) {
    // blocks -> atomic units; long lists become one unit per item (re-merged on the page); then glue headings / payment rows / signature fields
    const units = []; let seq = 0;
    canonBlocks[n - 1].forEach((src, i) => {
      if (/^(UL)$/.test(src.tagName) && src.children.length > 1) {
        const lid = n + ':' + i; [...src.children].forEach(li => { const ul = src.cloneNode(false); ul.appendChild(li.cloneNode(true)); ul._lid = lid; ul._b = i; ul._n = n; units.push(ul); });
      } else { const c = src.cloneNode(true); c._b = i; c._n = n; if (c.classList && c.classList.contains('phases')) enhancePhases(c); units.push(c); }
      seq++;
    });
    const groups = []; let cur = [];
    units.forEach((u, i) => {
      cur.push(u); const next = units[i + 1];
      if (isHead(u) && next) return;
      if (isGlue(u) && next && isGlue(next)) return;
      if (u.classList.contains('pay') && next && !next.classList.contains('pay') && !isHead(next)) return;
      groups.push(cur); cur = [];
    });
    if (cur.length) groups.push(cur);
    return groups;
  }

  function wordTokens(p) {
    const t = [];
    p.childNodes.forEach(nd => {
      if (nd.nodeType === 3) nd.nodeValue.split(/(\s+)/).forEach(x => { if (x) t.push({ h: x.replace(/&/g, '&amp;').replace(/</g, '&lt;'), ws: /^\s+$/.test(x) }); });
      else t.push({ h: nd.outerHTML || '', ws: false });
    });
    return t;
  }

  function paginateReader(H) {
    const out = [];                                  // {kind, el?, cls, blocks, n, b, scrolls}
    const probe = doc.createElement('section'); probe.className = 'page cont'; probe.style.height = H + 'px';
    const inner = doc.createElement('div'); inner.className = 'page-inner'; probe.appendChild(inner); reader.appendChild(probe);
    const over = () => probe.scrollHeight > probe.clientHeight + 1;
    let open = null, stream = 0;                      // current page being filled / chapter-stream counter
    readerOfCanon = [];
    const begin = (el, n) => {
      let cls = 'cont';
      if (el.tagName === 'H1' || (el.tagName === 'H2' && el.classList.contains('sub-chapter'))) cls = 'chapter';
      probe.className = 'page ' + cls; inner.replaceChildren(); open = { cls, scrolls: false, stream };
    };
    const flush = () => { if (!open) return; const t0 = probe.getBoundingClientRect().top; out.push({ kind: 'text', cls: open.cls, blocks: [...inner.children], bottoms: [...inner.children].map(c => c.getBoundingClientRect().bottom - t0), scrolls: open.scrolls, stream: open.stream }); inner.replaceChildren(); open = null; };
    const put = (el) => {                              // append one unit; returns undo
      const last = inner.lastElementChild;
      if (el._lid && last && last._lid === el._lid) { const li = el.firstElementChild; last.appendChild(li); return () => el.appendChild(li); }   // undo hands the item back to its own wrapper
      let node = el;
      if (!inner.children.length && el.tagName === 'H2' && el.classList.contains('sub-chapter')) { node = doc.createElement('h1'); node.innerHTML = el.innerHTML; node._n = el._n; node._b = el._b; }
      inner.appendChild(node); return () => node.remove();
    };
    const carryFlush = () => {                         // end the page, moving trailing headings to the next page so they stay with their text; null = the page holds only headings
      let k = inner.children.length; while (k > 0 && isHead(inner.children[k - 1])) k--;
      if (k === 0) return null;
      const carried = []; while (inner.children.length > k) { const h = inner.lastElementChild; h.remove(); carried.unshift(h); }
      flush(); return carried;
    };
    const splitParagraph = (p, n) => {                 // a paragraph taller than a page: flow it across pages at word boundaries
      let toks = wordTokens(p), guard = 0;
      while (toks.length && guard++ < 60) {
        const mk = (k) => { const c = p.cloneNode(false); c.innerHTML = toks.slice(0, k).map(t => t.h).join(''); c._n = p._n; c._b = p._b; return c; };
        const uf = put(mk(toks.length)); if (!over()) return; uf();
        const cands = []; toks.forEach((t, i) => { if (t.ws && i > 0) cands.push(i); });
        const words = i => toks.slice(i).filter(t => !t.ws).length;
        let lo = 0, hi = cands.length - 1, best = -1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; const u = put(mk(cands[mid])); const ok = !over(); u(); if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1; }
        while (best > 0 && words(cands[best]) < 8) best--;   // never strand a one-line widow
        if (best < 0) {
          const c = inner.children.length ? carryFlush() : null;
          if (c) { begin(c[0] || p, n); c.forEach(put); continue; }
          put(mk(toks.length)); open.scrolls = true; return;     // cannot be split further: safety valve
        }
        put(mk(cands[best])); flush();
        toks = toks.slice(cands[best] + 1); const b0 = p._b, n0 = p._n; p = p.cloneNode(false); p.classList.add('p-cont'); p._b = b0; p._n = n0; begin(p, n);
      }
    };
    const placeUnit = (el, n) => {
      if (!open) begin(el, n);
      const u = put(el); if (!over()) return; u();
      if (inner.children.length) { const c = carryFlush(); if (c) { begin(c[0] || el, n); c.forEach(put); const u2 = put(el); if (!over()) return; u2(); } }
      if (el.tagName === 'P') splitParagraph(el, n); else { put(el); open.scrolls = true; }
    };
    const strength = (u, nx) => {                      // how firmly two neighbouring blocks belong together
      if (u.classList.contains('money') && nx.tagName === 'H2') return 2;
      if (isHead(u)) return 3;
      if (isGlue(u) && isGlue(nx)) return 3;
      return 1;                                        // closing paragraph after payment rows
    };
    const placeGroup = (g, n) => {
      if (!open) begin(g[0], n);
      let undo = [];
      const tryAll = () => { undo = g.map(el => put(el)); return !over(); };
      if (tryAll()) return;
      undo.reverse().forEach(u => u());
      if (inner.children.length) { flush(); begin(g[0], n); if (tryAll()) return; undo.reverse().forEach(u => u()); }
      if (g.length === 1) { placeUnit(g[0], n); return; }
      // too tall for one page: break at the weakest join first, then fall back to block by block
      let cut = -1, min = 9;
      for (let i = 0; i < g.length - 1; i++) { const st = strength(g[i], g[i + 1]); if (st <= min) { min = st; cut = i; } }
      if (min < 3) { placeGroup(g.slice(0, cut + 1), n); placeGroup(g.slice(cut + 1), n); return; }
      g.forEach(el => placeUnit(el, n));
    };
    // keep a chapter's last page from being a stray line or two: pull the previous page's final block (or list item) forward
    const balanceTail = () => {
      for (let it = 0; it < 4; it++) {
        if (!open || !inner.children.length) return;
        const prev = out[out.length - 1]; if (!prev || prev.kind !== 'text' || prev.stream !== open.stream || prev.scrolls) return;
        const bottom = inner.lastElementChild.getBoundingClientRect().bottom - probe.getBoundingClientRect().top;
        if (bottom > 0.45 * H) return;
        const pb = prev.blocks; if (pb.length < 2) return;
        const lastB = pb[pb.length - 1]; let moved, undoDetach = () => {};
        if (lastB.tagName === 'UL' && lastB.children.length > 1) {
          const li = lastB.lastElementChild, ul = lastB.cloneNode(false); ul._lid = lastB._lid; ul._n = lastB._n; ul._b = lastB._b; ul.appendChild(li); moved = [ul]; undoDetach = () => lastB.appendChild(li);
        } else {
          moved = [lastB];                                // take the whole glued run (headings, payment rows, signature fields) so none is left behind
          for (let j = pb.length - 2; j > 0; j--) { const b = pb[j]; if (isHead(b) || (isGlue(b) && isGlue(moved[0]))) moved.unshift(b); else break; }
        }
        if (/^H1$/.test(moved[0].tagName) || (moved[0].tagName === 'H2' && moved[0].classList.contains('sub-chapter'))) { undoDetach(); return; }
        const wholeMove = !(moved.length === 1 && moved[0].tagName === 'UL' && moved[0] !== lastB);
        if (wholeMove) {                                  // never leave the earlier page ending on a heading, or nearly empty
          const rest = pb.slice(0, pb.length - moved.length);
          const restBottom = prev.bottoms ? prev.bottoms[pb.length - moved.length - 1] : 0;
          if (!rest.some(b => !isHead(b)) || restBottom < 0.45 * H) return;
        }
        const before = [...inner.children]; const first = before[0];
        let mergedLi = null;
        if (moved.length === 1 && moved[0]._lid && first && first._lid === moved[0]._lid) { mergedLi = moved[0].firstElementChild; first.insertBefore(mergedLi, first.firstChild); }
        else inner.replaceChildren(...moved, ...before);
        if (over()) { if (mergedLi) moved[0].appendChild(mergedLi); else inner.replaceChildren(...before); undoDetach(); return; }
        if (!(moved.length === 1 && moved[0].tagName === 'UL' && moved[0] !== lastB)) pb.splice(pb.length - moved.length, moved.length);   // (a moved list item was already detached)
      }
    };
    // cover first
    out.push({ kind: 'cover', el: canon[0].cloneNode(true) });
    if (H < 420) {                                   // landscape phone: too short to re-flow into readable pages, so each page scrolls vertically instead
      probe.remove();
      for (let n = 2; n <= canonN; n++) {
        const k = kind(canon[n - 1]); if (k === 'blank') continue;
        readerOfCanon[n] = out.length + 1;
        if (k === 'back') { out.push({ kind: 'back', el: canon[n - 1].cloneNode(true) }); continue; }
        out.push({ kind: 'text', cls: canon[n - 1].classList.contains('chapter') ? 'chapter' : 'cont', blocks: canonBlocks[n - 1].map(e => e.cloneNode(true)), n, b: 0, scrolls: true });
      }
      readerOfCanon[1] = 1;
      return materialise(out);
    }
    for (let n = 2; n <= canonN; n++) {
      const k = kind(canon[n - 1]);
      if (k === 'blank') continue;
      if (k === 'back') { balanceTail(); flush(); out.push({ kind: 'back', el: canon[n - 1].cloneNode(true) }); continue; }
      const isChapter = canon[n - 1].classList.contains('chapter');
      if (isChapter) { balanceTail(); flush(); stream++; }
      const groups = groupsOf(n);
      groups.forEach(g => placeGroup(g, n));
    }
    balanceTail(); flush(); probe.remove();
    return materialise(out);
  }
  function materialise(out) {
    const total = out.length;
    rmeta = [null]; canonOfReader = [null];
    out.forEach((it, i) => {
      const idx = i + 1;
      if (it.kind === 'cover') readerOfCanon[1] = idx;
      else if (it.kind === 'back') readerOfCanon[canonN] = idx;
      else (it.blocks || []).forEach(b => { const nn = b._n || it.n; if (nn && readerOfCanon[nn] === undefined) readerOfCanon[nn] = idx; });
    });
    for (let n = canonN - 1; n >= 1; n--) if (readerOfCanon[n] === undefined) readerOfCanon[n] = readerOfCanon[n + 1];   // skipped blank pages
    return out.map((it, i) => {
      const idx = i + 1; let el;
      if (it.el) { el = it.el; el.id = 'r' + idx; el.dataset.page = idx; el.setAttribute('aria-label', it.kind === 'cover' ? 'Cover' : 'Back cover'); rmeta[idx] = { n: it.kind === 'cover' ? 1 : canonN, b: 0 }; }
      else {
        el = doc.createElement('section'); el.className = 'page ' + it.cls + (it.scrolls ? ' scrolls' : ''); el.id = 'r' + idx; el.dataset.page = idx; el.setAttribute('aria-label', 'Page ' + idx + ' of ' + total);
        const inn = doc.createElement('div'); inn.className = 'page-inner';
        it.blocks.forEach(b => inn.appendChild(b));
        el.appendChild(inn); const f0 = it.blocks[0] || {}; rmeta[idx] = { n: f0._n || it.n || 1, b: f0._b || it.b || 0, nl: Math.max(...it.blocks.map(x => x._n || it.n || 1)) };   // nl: latest section on the page (labels the progress bar)
      }
      canonOfReader[idx] = rmeta[idx].n;
      return el;
    });
  }

  /* ───────── mount / unmount ───────── */
  function unmount() {
    if (book) { canon.forEach(p => { p.classList.remove('f', 'b'); p.inert = false; store.appendChild(p); }); book.remove(); book = null; sheets = []; }
    if (reader) { reader.remove(); reader = null; }
  }

  const keyOf = m => m.n * 10000 + m.b;
  function layout(anchor) {                          // (re)build reader pages for the current frame; returns the page index of `anchor`
    reader.classList.add('reflowing');
    reader.replaceChildren();
    layoutW = reader.clientWidth; layoutH = frameHeight();
    let els, slack = 0;
    for (let tries = 0; tries < 4; tries++) {          // self-correct: if any real page overflows its frame, re-flow with a little more headroom
      reader.replaceChildren();
      els = paginateReader(layoutH - slack);
      reader.replaceChildren(...els);
      reader.querySelectorAll('.toc a[data-goto]').forEach(a => { const t = readerOfCanon[+a.dataset.goto]; const sp = a.querySelector('.toc-n'); if (t && sp) sp.textContent = t; });   // printed numbers can be wider than the canonical ones: measure with them in place
      let worst = 0; els.forEach(e => { if (!e.classList.contains('scrolls') && !e.classList.contains('cover') && !e.classList.contains('back')) worst = Math.max(worst, e.scrollHeight - e.clientHeight); });
      if (worst <= 1) break;
      slack += worst + 2;
    }
    pages = els.map((e) => e); N = pages.length;
    buildToc();
    reader.classList.remove('reflowing');
    if (!anchor) return 1;
    const ak = keyOf(anchor); let best = 1;
    for (let i = 1; i <= N; i++) if (keyOf(rmeta[i]) <= ak) best = i;
    return best;
  }

  function mountReader(anchor) {
    reader = doc.createElement('div'); reader.className = 'reader';
    reader.setAttribute('role', 'group'); reader.setAttribute('aria-roledescription', 'carousel'); reader.setAttribute('aria-label', 'Crown & Core proposal pages');
    stage.appendChild(reader);
    cur = layout(anchor);
    reader.addEventListener('scroll', onReaderScroll, { passive: true });
    reader.addEventListener('scrollend', () => commitReader(true), { passive: true });
    snapReader(cur, false);
  }

  function mountSpread() {
    book = doc.createElement('div'); book.className = 'book';
    book.setAttribute('role', 'group'); book.setAttribute('aria-label', 'Crown & Core proposal book');
    for (let i = 0; i < S; i++) {
      const sh = doc.createElement('div'); sh.className = 'sheet';
      const front = pages[2 * i], back = pages[2 * i + 1];
      front.classList.add('f'); sh.appendChild(front);
      if (back) { back.classList.add('b'); sh.appendChild(back); }
      book.appendChild(sh); sheets.push(sh);
    }
    stage.appendChild(book);
    const mk = (cls, dir) => { const b = doc.createElement('button'); b.className = 'side ' + cls; b.type = 'button'; b.setAttribute('aria-label', dir > 0 ? 'Next page' : 'Previous page');
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir > 0 ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'}"/></svg>`;
      b.addEventListener('click', () => step(dir)); stage.appendChild(b); return b; };
    book._sides = [mk('prev', -1), mk('next', 1)];
    k = kFromPage(cur);
    sheets.forEach((s, i) => { s.classList.toggle('flipped', i < k); });
    settleZ(); applyShift(); applyInert();
    bindDrag();
  }

  const anchorOf = () => mode === 'reader' && rmeta[cur] ? { n: rmeta[cur].n, b: rmeta[cur].b } : { n: mode === 'spread' ? (k === 0 ? 1 : (k === S ? canonN : 2 * k + 1)) : cur, b: 0 };
  function setMode(next, anchorIn) {
    if (next === mode) return;
    const anchor = anchorIn || (mode ? anchorOf() : { n: cur, b: 0 });
    unmount();
    stage.querySelectorAll('.side').forEach(n => n.remove());
    mode = next;
    body.classList.remove('mode-reader', 'mode-spread'); body.classList.add('mode-' + mode);
    doc.documentElement.classList.add('mounted');
    if (mode === 'spread') { pages = canon; N = canonN; cur = clamp(anchor.n, 1, canonN); mountSpread(); buildToc(); }
    else mountReader(anchor);
    updateUI();
  }

  /* ───────── spread: leaf turning ───────── */
  function settleZ() { sheets.forEach((s, i) => { if (!s.classList.contains('turning')) s.style.zIndex = i < k ? i + 1 : S - i + 1; }); }
  function applyShift() { book.style.setProperty('--shift', k === 0 ? 'calc(var(--P) * -.5)' : (k === S ? 'calc(var(--P) * .5)' : '0px')); }
  function applyInert() {
    const left = k >= 1 ? 2 * k : null, right = k < S ? 2 * k + 1 : null;
    pages.forEach((p, i) => { const n = i + 1; p.inert = !(n === left || n === right); });
  }
  function setSpread(nk, animate = true) {
    nk = clamp(nk, 0, S); if (nk === k) return;
    const dir = nk > k ? 1 : -1, from = k;
    const idx = dir > 0 ? Array.from({ length: nk - from }, (_, i) => from + i) : Array.from({ length: from - nk }, (_, i) => from - 1 - i);
    k = nk; cur = k === 0 ? 1 : (k === S ? N : 2 * k + 1);
    applyShift(); applyInert(); updateUI();
    idx.forEach((si, order) => {
      const sh = sheets[si];
      const delay = (animate && !reduced()) ? Math.min(order, 5) * 70 : 0;
      sh.style.zIndex = 100 + (dir > 0 ? si : S - si);
      setTimeout(() => { if (animate && !reduced()) sh.classList.add('turning'); sh.classList.toggle('flipped', dir > 0); }, delay);
      setTimeout(() => { sh.classList.remove('turning'); settleZ(); }, delay + (animate && !reduced() ? TURN_MS + 60 : 0));
    });
  }

  function bindDrag() {
    let x0 = null, y0 = 0, t0 = 0;
    book.addEventListener('pointerdown', e => { if (e.target.closest('a,button')) { x0 = null; return; } x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); });
    book.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && !String(getSelection()).trim()) {
        const r = book.getBoundingClientRect();
        const right = k === 0 ? true : (k === S ? false : e.clientX > r.left + r.width / 2);
        step(right ? 1 : -1);
      }
    });
  }

  /* ───────── reader: native scroll-snap ───────── */
  function snapReader(p, smooth) {
    if (!reader) return;
    lockScroll = true; clearTimeout(lockT);
    reader.scrollTo({ left: (p - 1) * reader.clientWidth, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
    cur = p; updateUI();
    lockT = setTimeout(unlockReader, 400);              // fallback if no scroll event follows; while the jump animates, onReaderScroll keeps pushing this back until it settles
  }
  function unlockReader() {                            // the programmatic jump has settled: hand control back to the reader's own swipes
    lockScroll = false;
    if (!reader) return;
    const p = clamp(Math.round(reader.scrollLeft / Math.max(1, reader.clientWidth)) + 1, 1, N);
    if (p !== cur) cur = p;
    updateUI(true);
  }
  function onReaderScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = clamp(Math.round(reader.scrollLeft / Math.max(1, reader.clientWidth)) + 1, 1, N);
      if (lockScroll) { clearTimeout(lockT); lockT = setTimeout(unlockReader, 160); }
      else if (p !== cur) { cur = p; updateUI(false); }
      clearTimeout(idleT); idleT = setTimeout(() => { if (!lockScroll) commitReader(); }, 140);
    });
  }
  function commitReader() { updateUI(true); }

  /* ───────── shared navigation / UI ───────── */
  function step(dir) {
    if (mode === 'spread') setSpread(k + dir);
    else snapReader(clamp(cur + dir, 1, N), true);
  }
  function goto(p) {                                   // p = page number in the CURRENT mode
    p = clamp(p, 1, N);
    if (mode === 'spread') setSpread(kFromPage(p)); else snapReader(p, true);
  }
  const gotoCanon = n => goto(mode === 'reader' ? (readerOfCanon[clamp(n, 1, canonN)] || 1) : n);   // n = canonical page number (hashes, printed contents)
  const curCanon = () => mode === 'reader' ? (canonOfReader[cur] || 1) : (k === 0 ? 1 : (k === S ? canonN : 2 * k));

  function updateUI(announce = true) {
    let atStart, atEnd, text, frac, speak;
    if (mode === 'spread') {
      const l = k >= 1 ? 2 * k : null, r = k < S ? 2 * k + 1 : null;
      text = l && r ? `Pages ${l}–${r}` : (r ? 'Cover' : 'Back cover');
      frac = k / S; atStart = k === 0; atEnd = k === S;
      speak = l && r ? `Pages ${l} and ${r} of ${N}` : (r ? 'Cover' : 'Back cover');
    } else {
      text = cur === 1 ? 'Cover' : (cur === N ? 'Back cover' : `Page ${cur}`);
      frac = (cur - 1) / (N - 1); atStart = cur === 1; atEnd = cur === N;
      speak = cur === 1 ? 'Cover' : `Page ${cur} of ${N}`;
    }
    label.innerHTML = `${text} <span>/ ${N}</span>`;
    if (mode === 'reader' && reader && reader.children[cur - 1]) reader.children[cur - 1].querySelectorAll('.paybar:not(.in)').forEach(x => x.classList.add('in'));
    if (secEl) { const cn = mode === 'reader' ? (rmeta[cur] ? (rmeta[cur].nl || rmeta[cur].n) : 1) : (k === 0 ? 1 : (k === S ? canonN : 2 * k + 1)); secEl.textContent = (mode === 'reader' ? cur === 1 : k === 0) ? '' : (mode === 'reader' ? cur === N : k === S) ? '' : sectionOfCanon(cn); }
    bar.style.transform = `scaleX(${clamp(frac, 0, 1).toFixed(4)})`;
    prevBtns.forEach(b => b.disabled = atStart); nextBtns.forEach(b => b.disabled = atEnd);
    if (book) book._sides.forEach((b, i) => b.disabled = i === 0 ? atStart : atEnd);
    if (announce && live) live.textContent = speak;
    const cp = mode === 'spread' ? (k === 0 ? 1 : (k === S ? N : 2 * k)) : cur;
    tocSheet.querySelectorAll('a[data-goto]').forEach(a => { const n = +a.dataset.goto; a.toggleAttribute('aria-current', n === cp || (mode === 'spread' && n === cp + 1 && k > 0 && k < S)); if (!a.hasAttribute('aria-current')) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'true'); });
    if (announce && mode) savePlace(anchorOf());
    if (announce) { try { const cc = curCanon(); history.replaceState(null, '', cc === 1 ? location.pathname + location.search : '#p' + cc); } catch (_) {} }
    if (typeof motion === 'function') motion();
    if (typeof turnFx === 'function') turnFx(announce);
  }

  /* ───────── contents sheet ───────── */
  function buildToc() {
    const wrap = doc.createDocumentFragment();
    const seen = new Map();                            // canonical page -> title: every chapter plus the printed-contents entries (e.g. Agreement Parties)
    canon.forEach((p, i) => { const h = i > 0 && p.classList.contains('chapter') && p.querySelector('h1'); if (h) seen.set(i + 1, txtOf(h)); });
    sectionStarts.forEach(s => { if (s.t !== 'Review Period' && !seen.has(s.n)) seen.set(s.n, s.t); });
    const entries = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([n, title]) => ({ n, title, idx: mode === 'reader' ? (readerOfCanon[n] || 1) : n }));
    const inv = entries.find(e => e.title === 'Investment');
    if (inv) {
      const a = doc.createElement('a'); a.className = 'toc-offer'; a.dataset.goto = inv.idx;
      a.href = '#p' + inv.n;
      a.innerHTML = `Go to the investment <span>${inv.idx}</span>`; wrap.appendChild(a);
    }
    if (signUrl) { const s = doc.createElement('a'); s.className = 'toc-offer toc-sign'; s.href = signUrl; s.target = '_blank'; s.rel = 'noopener noreferrer'; s.textContent = 'Review and sign'; wrap.appendChild(s); }
    let grp = null, ol = null;
    entries.forEach(e => {
      const g = groupOf[e.title] !== undefined ? groupOf[e.title] : (grp === null ? '' : grp);   // entries without a printed group join the one before them
      if (g !== grp || !ol) {
        grp = g;
        if (g) { const h3 = doc.createElement('h3'); h3.className = 'toc-grp'; h3.textContent = g; wrap.appendChild(h3); }
        ol = doc.createElement('ol'); wrap.appendChild(ol);
      }
      const li = doc.createElement('li'), a = doc.createElement('a');
      a.href = '#p' + e.n; a.dataset.goto = e.idx;
      a.innerHTML = `<span>${e.idx}</span>`; a.append(e.title);
      li.appendChild(a); ol.appendChild(li);
    });
    tocSheet.querySelector('.toc-list').replaceChildren(wrap);
  }
  /* sheets: leave the way they arrived (200ms ease-out), and swipe down to dismiss (a flick is enough) */
  function showSheet(sheet) { clearTimeout(sheet._t); sheet.classList.remove('closing'); const p = sheet.querySelector('.panel'); p.style.transform = ''; p.classList.remove('dragging', 'settling'); sheet.hidden = false; }
  function hideSheet(sheet) {
    if (sheet.hidden || sheet.classList.contains('closing')) return;
    sheet.classList.add('closing');
    sheet._t = setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); const p = sheet.querySelector('.panel'); p.style.transform = ''; p.classList.remove('dragging', 'settling'); }, reduced() ? 130 : 210);
  }
  function sheetDrag(sheet, close) {
    const panel = sheet.querySelector('.panel'), head = sheet.querySelector('.panel-head'); let st = null;
    head.addEventListener('pointerdown', e => {
      if ((e.pointerType === 'mouse' && e.button > 0) || e.target.closest('button') || st) return;
      st = { id: e.pointerId, y0: e.clientY, dy: 0, s: [{ t: performance.now(), y: e.clientY }] };
      try { head.setPointerCapture(e.pointerId); } catch (_) {}
      panel.classList.remove('settling'); panel.classList.add('dragging');
    });
    head.addEventListener('pointermove', e => {
      if (!st || e.pointerId !== st.id) return;
      const raw = e.clientY - st.y0; st.dy = raw < 0 ? raw * 0.15 : raw;           // friction instead of a wall when pulled up
      panel.style.transform = `translateY(${st.dy}px)`;
      const now = performance.now(); st.s.push({ t: now, y: e.clientY }); while (st.s.length > 2 && now - st.s[0].t > 100) st.s.shift();
    });
    const end = e => {
      if (!st || e.pointerId !== st.id) return;
      const now = performance.now(); st.s.push({ t: now, y: st.s[st.s.length - 1].y }); while (st.s.length > 2 && now - st.s[0].t > 100) st.s.shift();   // a finger that rests before release has no velocity
      const a = st.s[0], b = st.s[st.s.length - 1], v = (b.y - a.y) / Math.max(1, b.t - a.t), dy = st.dy; st = null;
      panel.classList.remove('dragging');
      if (e.type !== 'pointercancel' && (dy > 90 || (v > 0.11 && dy > 8))) close();
      else { panel.classList.add('settling'); panel.style.transform = ''; setTimeout(() => panel.classList.remove('settling'), 300); }
    };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  }
  let lastFocus = null;
  function openToc() {
    lastFocus = doc.activeElement; showSheet(tocSheet); stage.inert = true; doc.querySelector('.chrome-top').inert = true; doc.querySelector('.chrome-bottom').inert = true;
    const first = tocSheet.querySelector('a[aria-current="true"]') || tocSheet.querySelector('a'); first && first.focus();
    tocBtn.setAttribute('aria-expanded', 'true');
  }
  function closeToc() {
    hideSheet(tocSheet); stage.inert = false; doc.querySelector('.chrome-top').inert = false; doc.querySelector('.chrome-bottom').inert = false;
    tocBtn.setAttribute('aria-expanded', 'false'); (lastFocus && lastFocus.focus) ? lastFocus.focus() : tocBtn.focus();
  }

  /* ───────── tap-to-open note (tax detail): the full text stays in the page for print/PDF; on screen it opens as a sheet ───────── */
  const noteSheet = doc.createElement('div');
  noteSheet.className = 'toc-sheet'; noteSheet.id = 'note-sheet'; noteSheet.setAttribute('role', 'dialog'); noteSheet.setAttribute('aria-modal', 'true'); noteSheet.hidden = true;
  noteSheet.innerHTML = '<div class="scrim" data-close></div><div class="panel"><div class="panel-head"><h2 id="note-title"></h2><button class="panel-close" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><p class="note-text"></p></div>';
  noteSheet.setAttribute('aria-labelledby', 'note-title');
  doc.body.appendChild(noteSheet);
  let noteFocus = null;
  function openNote(btn) {
    const p = btn.closest('p'); let src = p && p.querySelector('.tax-more'), txt = null;
    if (!src && btn.hasAttribute('data-more-ref')) {   // the total line under the price opens the same note; show the rate and totals together with the explanation
      src = stage.querySelector('.tax-more') || doc.querySelector('.tax-more');
      const holder = src && src.closest('p');
      if (holder) txt = [...holder.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('more-btn'))).map(n => n.textContent).join('').replace(/\s+/g, ' ').replace(/^\*\s*/, '').trim();
    }
    if (!src) return;
    noteFocus = btn; noteSheet.querySelector('#note-title').textContent = btn.textContent.trim();
    noteSheet.querySelector('.note-text').textContent = txt || src.textContent.trim();
    showSheet(noteSheet); stage.inert = true; doc.querySelector('.chrome-top').inert = true; doc.querySelector('.chrome-bottom').inert = true;
    noteSheet.querySelector('.panel-close').focus();
  }
  function closeNote() {
    hideSheet(noteSheet); stage.inert = false; doc.querySelector('.chrome-top').inert = false; doc.querySelector('.chrome-bottom').inert = false;
    noteFocus && noteFocus.focus && noteFocus.focus();
  }
  noteSheet.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', closeNote));
  sheetDrag(noteSheet, closeNote); sheetDrag(tocSheet, closeToc);
  stage.addEventListener('click', e => { const b = e.target.closest('.more-btn'); if (b) { e.preventDefault(); openNote(b); } });
  /* three-phase tabs (reader only; print and the desktop spread show all three columns) */
  function pickPhase(btn) {
    const box = btn.closest('.phases'); if (!box) return; const hs = [...box.querySelectorAll('.phase-h')], k = hs.indexOf(btn.closest('.phase-h'));
    [...box.querySelectorAll('.phase-list')].forEach((l, i) => { l.classList.toggle('on', i === k); });
    hs.forEach((h, i) => { h.classList.toggle('on', i === k); h.firstElementChild.setAttribute('aria-expanded', i === k ? 'true' : 'false'); });
  }
  stage.addEventListener('click', e => { const b = e.target.closest('.reader .phase-btn'); if (b) pickPhase(b); });
  stage.addEventListener('keydown', e => {
    const b = e.target.closest && e.target.closest('.reader .phase-btn'); if (!b || !/^Arrow(Left|Right)$/.test(e.key)) return;
    const all = [...b.closest('.phases').querySelectorAll('.phase-btn')], i = all.indexOf(b), nx = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
    e.preventDefault(); nx.focus(); pickPhase(nx);
  });

  /* ───────── events ───────── */
  prevBtns.forEach(b => b.addEventListener('click', () => step(-1)));
  nextBtns.forEach(b => b.addEventListener('click', () => step(1)));
  tocBtn.addEventListener('click', openToc);
  tocSheet.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', closeToc));
  tocSheet.addEventListener('click', e => {
    const a = e.target.closest('a[data-goto]'); if (!a) return;
    e.preventDefault(); const n = +a.dataset.goto; closeToc(); goto(n);
  });
  stage.addEventListener('click', e => { const a = e.target.closest('.page a[data-goto]'); if (a) { e.preventDefault(); gotoCanon(+a.dataset.goto); } });
  doc.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!noteSheet.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeNote(); } else if (e.key === 'Tab') { e.preventDefault(); noteSheet.querySelector('.panel-close').focus(); }
      return;
    }
    if (!tocSheet.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeToc(); }
      else if (e.key === 'Tab') { const f = [...tocSheet.querySelectorAll('a,button')]; const i = f.indexOf(doc.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const map = { ArrowRight: () => step(1), ArrowLeft: () => step(-1), PageDown: () => step(1), PageUp: () => step(-1), Home: () => goto(1), End: () => goto(N) };
    if (e.key === ' ' && mode === 'spread') { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
    if (map[e.key] && !(mode === 'reader' && /Arrow/.test(e.key) && e.target.closest && e.target.closest('.page') && false)) { e.preventDefault(); map[e.key](); }
  });
  addEventListener('hashchange', () => { const p = pageFromHash(); if (p !== curCanon()) gotoCanon(p); });
  const onMode = () => { const want = spreadMq.matches ? 'spread' : 'reader'; if (want !== mode) setMode(want); };
  spreadMq.addEventListener('change', onMode);
  function relayout() {                                // screen size / rotation / text size changed: re-flow, keep the reader on the same words
    if (mode !== 'reader' || !reader) return;
    if (reader.clientWidth === layoutW && Math.abs(frameHeight() - layoutH) <= 2) return;
    const anchor = anchorOf(); cur = layout(anchor); lockScroll = true; reader.scrollTo({ left: (cur - 1) * reader.clientWidth, behavior: 'auto' }); updateUI(false); setTimeout(() => { lockScroll = false; }, 80);
  }
  let rsT; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(relayout, 160); });
  addEventListener('orientationchange', () => { clearTimeout(rsT); rsT = setTimeout(relayout, 260); });


  /* ───────── round 7: motion that answers the page turn (foil light on the cover, the funnel lighting up). Words never change; nothing here is needed to read. ───────── */
  const lightEl = doc.getElementById('foil-light');
  function visibleCanonPages() {
    if (mode === 'reader') { const e = reader && reader.children[cur - 1]; return e ? [e] : []; }
    if (mode === 'spread') { const l = k >= 1 ? 2 * k : null, r = k < S ? 2 * k + 1 : null; return [l && canon[l - 1], r && canon[r - 1]].filter(Boolean); }
    return [];
  }
  function syncFlows() {
    if (doc.documentElement.classList.contains('measure')) return;
    doc.querySelectorAll('ol.flow, .tline, .paybar').forEach(f => { if (!f.classList.contains('armed')) f.classList.add('armed'); if (f.tagName === 'OL') { const last = f.lastElementChild; if (last) f.style.setProperty('--fl', last.offsetTop + 'px'); } });
    const vis = new Set(visibleCanonPages());
    doc.querySelectorAll('ol.flow.armed, .tline.armed, .paybar.armed').forEach(f => { const on = vis.has(f.closest('.page')); if (on !== f.classList.contains('on')) f.classList.toggle('on', on); });
  }
  let flowT = 0;
  function scheduleFlows() { clearTimeout(flowT); flowT = setTimeout(syncFlows, mode === 'spread' && !reduced() ? 420 : 90); }

  // foil light: one point light, eased toward a target that comes from the pointer, device tilt, or a slow idle drift
  let light = { x: .5, y: .3, tx: .5, ty: .3, t0: 0, cyc: -1, rafId: 0, pointerAt: -1e9, tiltAt: -1e9 };
  function coverFoil() {
    if (mode === 'reader') return cur === 1 && reader && reader.children[0] ? reader.children[0].querySelector('.foil') : null;
    if (mode === 'spread') return k === 0 ? canon[0].querySelector('.foil') : null;
    return null;
  }
  function paintLight(f) {
    if (!lightEl || !f) return;
    const w = f.offsetWidth || 1, h = f.offsetHeight || 1;
    lightEl.setAttribute('x', (light.x * w).toFixed(1)); lightEl.setAttribute('y', (light.y * h).toFixed(1)); lightEl.setAttribute('z', Math.round(w * .32));
    f.parentNode.parentNode.style.setProperty('--sx', (100 - light.x * 100).toFixed(1) + '%');
  }
  function glint(f) { f.classList.remove('glint'); void f.offsetWidth; f.classList.add('glint'); }
  function lightLoop(ts) {
    light.rafId = 0;
    const f = coverFoil();
    if (!f || doc.hidden || reduced()) return;
    if (!light.t0) light.t0 = ts;
    const t = ts - light.t0;
    if (ts - light.pointerAt > 2600 && ts - light.tiltAt > 1200) {
      const ph = t % 7000;
      if (ph < 1700) { const p = ph / 1700, e = 1 - Math.pow(1 - p, 3); light.tx = -.15 + 1.2 * e; light.ty = .22 + .1 * Math.sin(p * 3.14); }   // a sweep on arrival, then again every 7 seconds
      else { light.tx = .5 + .4 * Math.sin(t / 3200); light.ty = .35 + .22 * Math.sin(t / 2300 + 1); }                                              // slow drift in between
      const cyc = Math.floor(t / 7000); if (cyc !== light.cyc) { light.cyc = cyc; glint(f); }                                                       // the bright reflection travels with each sweep
    }
    light.x += (light.tx - light.x) * .14; light.y += (light.ty - light.y) * .14;
    paintLight(f);
    light.rafId = requestAnimationFrame(lightLoop);
  }
  function kickLight() { if (!light.rafId && !doc.documentElement.classList.contains('measure')) { const f = coverFoil(); if (f) { light.t0 = 0; light.cyc = -1; light.rafId = requestAnimationFrame(lightLoop); } else paintLight(null); } }
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return; const f = coverFoil(); if (!f) return;
    const r = f.getBoundingClientRect(); light.tx = Math.max(-.2, Math.min(1.2, (e.clientX - r.left) / r.width)); light.ty = Math.max(-.3, Math.min(1.4, (e.clientY - r.top) / r.height)); light.pointerAt = performance.now();
  }, { passive: true });
  addEventListener('deviceorientation', e => {
    if (e.gamma == null || !coverFoil()) return;
    light.tx = .5 + Math.max(-1, Math.min(1, e.gamma / 28)) * .6; light.ty = .4 + Math.max(-1, Math.min(1, ((e.beta || 50) - 50) / 28)) * .35; light.tiltAt = performance.now();
  }, { passive: true });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) kickLight(); });
  function motion() { scheduleFlows(); kickLight(); }


  /* ───────── round 8: optional page-turn sound (off by default; synthesised, so nothing to download) ───────── */
  const sndBtn = doc.getElementById('snd-btn');
  let sndOn = false, ac = null, noiseBuf = null, lastTurn = null;
  try { sndOn = localStorage.getItem('crown-core-sound') === '1'; } catch (_) {}
  function audioCtx() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch (_) { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function paintSnd() { if (sndBtn) sndBtn.setAttribute('aria-pressed', String(sndOn)); }
  function paperRustle() {
    const c = audioCtx(); if (!c) return;
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * .4), c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = c.currentTime + .005, out = c.createGain(); out.gain.value = .5; out.connect(c.destination);
    const burst = (at, dur, f0, f1, peak) => {
      const s = c.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = .9 + Math.random() * .2;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .9; bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + .014); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
      s.connect(bp); bp.connect(g); g.connect(out); s.start(at, Math.random() * .1, dur + .05);
    };
    burst(t, .24, 1700, 5200, .17); burst(t + .085, .16, 2600, 6200, .08);                          // the sweep, then the flutter
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(70, t + .07);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.06, t + .008); og.gain.exponentialRampToValueAtTime(.0001, t + .09); o.connect(og); og.connect(out); o.start(t); o.stop(t + .12);   // the soft thump of the leaf settling
  }
  function turnFx(announce) {
    const key = mode === 'spread' ? 's' + k : mode + cur;
    const changed = lastTurn !== null && key !== lastTurn; lastTurn = key;
    if (!announce || !changed || !sndOn || reduced()) return;
    paperRustle(); try { navigator.vibrate && navigator.vibrate(6); } catch (_) {}
  }
  if (sndBtn) {
    paintSnd();
    sndBtn.addEventListener('click', () => { sndOn = !sndOn; try { localStorage.setItem('crown-core-sound', sndOn ? '1' : '0'); } catch (_) {} paintSnd(); if (sndOn) { audioCtx(); paperRustle(); } });
    addEventListener('pointerdown', () => { if (sndOn) audioCtx(); }, { passive: true });
  }

  /* ───────── boot ───────── */
  canon.forEach(p => store.appendChild(p));
  const startAnchor = /^#p\d+$/.test(location.hash) ? { n: pageFromHash(), b: 0 } : (loadPlace() || { n: 1, b: 0 });   // a link wins; otherwise pick up where the reader left off
  const startCanon = startAnchor.n;
  doc.documentElement.classList.add('no-anim');
  const boot = () => {
    const a0 = /^#p\d+$/.test(location.hash) ? { n: pageFromHash(), b: 0 } : startAnchor;   // a link followed while the fonts were still loading still wins
    cur = a0.n;
    setMode(spreadMq.matches ? 'spread' : 'reader', a0);
    if (mode === 'spread') { k = kFromPage(cur); sheets.forEach((s, i) => s.classList.toggle('flipped', i < k)); settleZ(); applyShift(); applyInert(); updateUI(false); }
    requestAnimationFrame(() => requestAnimationFrame(() => doc.documentElement.classList.remove('no-anim')));
  };
  // measure with the real fonts, but never wait long
  // the pages are not in the DOM yet, so ask for the faces explicitly; otherwise we would measure with fallback fonts
  const faces = ['400 16px "Libre Caslon Text"', 'italic 400 16px "Libre Caslon Text"', '400 16px Inter', '600 16px Inter'];
  const fontsReady = doc.fonts && doc.fonts.load ? Promise.race([Promise.all(faces.map(f => doc.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
  fontsReady.then(() => { boot(); if (/[?&]selftest\b/.test(location.search)) selfTest(); });
  if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', () => { if (mode === 'reader' && reader) { layoutW = -1; relayout(); } });

  /* ───────── ?selftest — guided real-device check (swipe / buttons / contents); produces a copyable report ───────── */
  function selfTest() {
    const box = doc.createElement('div');
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Device self-test');
    box.style.cssText = 'position:fixed;z-index:9999;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 56px);background:rgba(12,11,9,.94);color:#f1ead8;border:1px solid #bfa56a;border-radius:12px;padding:10px 12px;font:14px/1.4 system-ui,sans-serif;max-height:46vh;overflow:auto';
    doc.body.appendChild(box);
    const results = [], t0 = new Date().toISOString();
    const steps = [
      { id: 'swipe_left_turns_forward', text: 'Swipe LEFT on the page text (finger moves right to left), once.', ok: (b) => cur === b.cur + 1 },
      { id: 'swipe_right_turns_back', text: 'Swipe RIGHT once.', ok: (b) => cur === b.cur - 1 },
      { id: 'five_quick_swipes_left', text: 'Swipe LEFT five times in a row, quickly.', ok: (b) => cur - b.cur >= 3, done: true },
      { id: 'vertical_drag_does_not_turn', text: 'Drag your finger UP and DOWN on the text a few times, then tap "Done".', ok: (b) => cur === b.cur && (!reader || Math.abs(reader.scrollLeft - b.left) < 2), done: true },
      { id: 'next_button', text: 'Tap the › button once.', ok: (b) => cur === b.cur + 1 },
      { id: 'prev_button', text: 'Tap the ‹ button once.', ok: (b) => cur === b.cur - 1 },
      { id: 'contents_open_close', text: 'Tap Contents, then close it (Close button, or tap outside it).', ok: (b) => b.opened && tocSheet.hidden, track: true },
    ];
    let i = -1, base = null, timer = 0;
    const render = (html) => { box.innerHTML = html; };
    const startStep = () => {
      i++; if (i >= steps.length) return finish();
      const st = steps[i]; base = { cur, left: reader ? reader.scrollLeft : 0, opened: false, t: performance.now() };
      render(`<b>Step ${i + 1} of ${steps.length}</b><br>${st.text}<br><button data-done style="margin:8px 8px 0 0;min-height:44px;padding:0 14px">${st.done ? 'Done' : 'It did not work'}</button><button data-skip style="margin-top:8px;min-height:44px;padding:0 14px">Skip</button>`);
      clearInterval(timer);
      if (!st.done) timer = setInterval(() => { if (st.track && !tocSheet.hidden) base.opened = true; if (st.ok(base)) { record(st, true); } }, 150);
    };
    const record = (st, pass, note) => { clearInterval(timer); results.push({ step: st.id, pass, note: note || '', cur_before: base.cur, cur_after: cur, ms: Math.round(performance.now() - base.t) }); setTimeout(startStep, 350); };
    box.addEventListener('click', e => {
      const st = steps[i]; if (!st) return;
      if (e.target.closest('[data-skip]')) { record(st, null, 'skipped'); return; }
      if (e.target.closest('[data-done]')) record(st, st.done ? !!st.ok(base) : false, st.done ? '' : 'user reported failure');
    });
    const finish = () => {
      const report = { build: 'crown-core-v3', started: t0, finished: new Date().toISOString(), userAgent: navigator.userAgent, platform: navigator.platform, viewport: innerWidth + 'x' + innerHeight, dpr: devicePixelRatio, screen: screen.width + 'x' + screen.height, orientation: (screen.orientation && screen.orientation.type) || '', coarsePointer: matchMedia('(pointer:coarse)').matches, mode, pages: N, results, allPassed: results.every(r => r.pass === true) };
      const txt = JSON.stringify(report, null, 2);
      render(`<b>Self-test finished: ${report.allPassed ? 'ALL PASSED' : 'SOME STEPS NOT PASSED'}</b><br>Copy this report and send it back with the phone model and OS version.<br><textarea readonly style="width:100%;height:120px;margin-top:6px;font:11px/1.3 monospace">${txt.replace(/</g, '&lt;')}</textarea><br><button data-copy style="min-height:44px;padding:0 14px">Copy report</button>`);
      box.querySelector('[data-copy]').addEventListener('click', () => { const ta = box.querySelector('textarea'); ta.select(); try { navigator.clipboard.writeText(txt); } catch (_) { doc.execCommand('copy'); } });
    };
    render('<b>Crown &amp; Core device self-test</b><br>About one minute. It checks swiping, the arrow buttons and the contents panel on this phone.<br><button data-go style="margin-top:8px;min-height:44px;padding:0 14px">Start</button>');
    box.querySelector('[data-go]').addEventListener('click', e => { e.stopPropagation(); startStep(); }, { once: true });
  }
})();
