(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const params = new URLSearchParams(location.search);
  const batchId = params.get("id") || "";
  const ICON = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  };

  let batch = null, meta = null;
  let state = { tab: "lectures", s: null };
  let curList = [], curIdx = -1, hls = null, filterText = "";
  const watchKey = "cx-watched-" + batchId;
  const watched = (() => { try { return new Set(JSON.parse(localStorage.getItem(watchKey) || "[]")); } catch (e) { return new Set(); } })();
  const saveWatched = () => { try { localStorage.setItem(watchKey, JSON.stringify([...watched].slice(-4000))); } catch (e) {} };

  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200); }

  async function init() {
    if (!/^[a-z0-9-]+$/i.test(batchId)) return fail("Batch not found.");
    try {
      const [dRes, bRes] = await Promise.all([fetch("data/" + batchId + ".json"), fetch("batches.json").catch(() => null)]);
      if (!dRes.ok) throw new Error("not found");
      batch = await dRes.json();
      try { const bj = bRes && (await bRes.json()); meta = (bj.batches || []).find((b) => b._id === batchId) || null; } catch (e) {}
    } catch (e) { return fail("This batch could not be loaded. Please go back and try again."); }
    document.title = batch.name + " — CODEX STUDYS";
    trackRecent();
    const h = readHash();
    state = h;
    history.replaceState(state, "");
    render();
  }

  function fail(msg) { $("#topTitle").textContent = "Batch"; $("#page").innerHTML = '<div class="empty">' + esc(msg) + "</div>"; }

  function readHash() {
    const m = location.hash.match(/tab=(lectures|notes|about)(?:&s=(\d+))?/);
    return { tab: m ? m[1] : "lectures", s: m && m[2] !== undefined ? +m[2] : null };
  }
  function go(tab, s) {
    state = { tab, s: s === undefined ? null : s };
    filterText = "";
    history.pushState(state, "", "#tab=" + tab + (state.s !== null ? "&s=" + state.s : ""));
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", (e) => {
    if ($("#player").classList.contains("open") && !(e.state && e.state.p)) closePlayer(true);
    state = (e.state && e.state.tab) ? { tab: e.state.tab, s: e.state.s === undefined ? null : e.state.s } : readHash();
    filterText = ""; render();
  });
  $("#backBtn").addEventListener("click", () => {
    if (state.s !== null) { history.back(); return; }
    if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) history.back();
    else location.href = "index.html#courses";
  });

  function trackRecent() {
    try {
      const k = "codex-studys-recent";
      const arr = JSON.parse(localStorage.getItem(k) || "[]").filter((x) => x._id !== batchId);
      arr.unshift({ _id: batchId, name: batch.name, byName: batch.by || "", language: (meta && meta.language) || "", previewImage: (meta && meta.previewImage) || "" });
      localStorage.setItem(k, JSON.stringify(arr.slice(0, 8)));
    } catch (e) {}
  }

  const total = (groups) => groups.reduce((n, g) => n + g.i.length, 0);

  function render() {
    const page = $("#page");
    const groups = state.tab === "notes" ? batch.notes : batch.lectures;
    const inSubject = state.s !== null && state.tab !== "about" && groups[state.s];
    $("#topTitle").textContent = inSubject ? groups[state.s].n : batch.name;
    if (inSubject) { page.innerHTML = renderItems(groups[state.s]); bindItems(groups[state.s]); return; }
    const img = (meta && meta.previewImage) || "assets/batch-" + batchId + ".webp";
    let html = '<div class="hero"><img class="hero-img" src="' + esc(img) + '" alt="' + esc(batch.name) + '" onerror="this.src=\'assets/codex-telegram.png\'">' +
      '<div class="hero-body"><h2 class="hero-title">' + esc(batch.name) + '</h2><p class="hero-sub">' + esc(batch.by || "") + '</p>' +
      '<div class="badges"><span class="badge accent">Recorded</span><span class="badge">' + esc((meta && meta.language) || "Hinglish") + '</span></div></div></div>' +
      '<div class="tabs">' + ["lectures", "notes", "about"].map((t) => '<button class="tab' + (state.tab === t ? " active" : "") + '" data-tab="' + t + '" type="button">' + t[0].toUpperCase() + t.slice(1) + "</button>").join("") + "</div>";
    if (state.tab === "about") html += renderAbout();
    else html += '<div class="list">' + (groups.length ? groups.map((g, i) => subjectRow(g, i)).join("") : '<div class="empty">Nothing here yet.</div>') + "</div>";
    page.innerHTML = html;
    page.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab !== state.tab) go(b.dataset.tab); }));
    page.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => go(state.tab, +b.dataset.s)));
  }

  function subjectRow(g, i) {
    const notes = state.tab === "notes";
    const n = g.i.length;
    return '<button class="row" type="button" data-s="' + i + '"><span class="ico' + (notes ? " pdf" : "") + '">' + (notes ? ICON.doc : ICON.video) + '</span><span class="row-main"><span class="row-name">' + esc(g.n) +
      '</span><div class="row-sub">' + n + (notes ? (n === 1 ? " note" : " notes") : (n === 1 ? " lecture" : " lectures")) + "</div></span>" + ICON.chev + "</button>";
  }

  function renderAbout() {
    const subj = batch.lectures.map((g) => g.n);
    return '<div class="stats"><div class="stat"><b>' + total(batch.lectures) + '</b><span>Lectures</span></div><div class="stat"><b>' + total(batch.notes) + '</b><span>Notes</span></div><div class="stat"><b>' + batch.lectures.length + '</b><span>Subjects</span></div></div>' +
      '<div class="about-card"><h3>About this batch</h3><p>' + esc(batch.about || "") + '</p></div>' +
      '<div class="about-card" style="margin-top:14px"><h3>Subjects</h3><div class="tags">' + subj.map((s) => '<span class="tag">' + esc(s) + "</span>").join("") + "</div></div>";
  }

  function renderItems(g) {
    const notes = state.tab === "notes";
    let h = '<p class="crumb">' + esc(batch.name) + " › " + (notes ? "Notes" : "Lectures") + " › " + esc(g.n) + "</p>";
    if (g.i.length > 10) h += '<input class="search" id="itemSearch" type="search" placeholder="Search in ' + esc(g.n) + '…" autocomplete="off" value="' + esc(filterText) + '">';
    h += '<div class="list" id="itemList"></div>';
    return h;
  }

  function bindItems(g) {
    const notes = state.tab === "notes";
    const list = $("#itemList");
    const draw = () => {
      const q = filterText.trim().toLowerCase();
      const rows = [];
      g.i.forEach((it, idx) => { if (!q || it[0].toLowerCase().includes(q)) rows.push([it, idx]); });
      curList = rows.map((r) => ({ it: r[0], idx: r[1] }));
      list.innerHTML = rows.length ? rows.map(([it, idx], n) => itemRow(it, idx, n, notes)).join("") : '<div class="empty">No results found.</div>';
      list.querySelectorAll("[data-n]").forEach((el) => el.addEventListener("click", (e) => {
        const n = +el.dataset.n; const a = e.target.closest("[data-act]");
        if (notes) { openNote(curList[n], a && a.dataset.act); } else openLecture(n);
      }));
    };
    const search = $("#itemSearch");
    if (search) search.addEventListener("input", () => { filterText = search.value; draw(); });
    draw();
  }

  const wkey = (idx) => state.tab[0] + state.s + ":" + idx;
  function itemRow(it, idx, n, notes) {
    const done = watched.has(wkey(idx));
    if (notes) return '<div class="row item' + (done ? " done" : "") + '" data-n="' + n + '" role="button" tabindex="0"><span class="ico pdf" style="width:42px;height:42px;border-radius:13px">' + ICON.doc + '</span><span class="row-main"><span class="row-name">' + esc(it[0]) + '</span></span><span class="act"><button class="pill-btn solid" data-act="view" type="button">View</button><button class="pill-btn" data-act="dl" type="button">Download</button></span></div>';
    return '<div class="row item' + (done ? " done" : "") + '" data-n="' + n + '" role="button" tabindex="0"><span class="num">' + (done ? "✓" : idx + 1) + '</span><span class="row-main"><span class="row-name">' + esc(it[0]) + '</span></span><span class="play">' + ICON.play + "</span></div>";
  }

  function openNote(entry, act) {
    const url = entry.it[1];
    watched.add(wkey(entry.idx)); saveWatched();
    if (act === "dl") { const a = document.createElement("a"); a.href = url; a.download = ""; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); a.remove(); toast("Download started"); }
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  /* ---------- player ---------- */
  function loadHls() {
    return new Promise((res, rej) => {
      if (window.Hls) return res();
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.4.0/hls.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function teardown() {
    const v = $("#pVideo");
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    try { v.pause(); } catch (e) {}
    v.removeAttribute("src"); v.load();
    $("#pStage").querySelectorAll("iframe").forEach((f) => f.remove());
    $("#pMsg").classList.remove("show");
  }
  function showMsg(html) { const m = $("#pMsg"); m.innerHTML = html; m.classList.add("show"); }

  function openLecture(n) {
    if (!$("#player").classList.contains("open")) history.pushState(Object.assign({}, state, { p: 1 }), "");
    curIdx = n; playCurrent();
    $("#player").classList.add("open"); document.body.style.overflow = "hidden";
  }
  async function playCurrent() {
    const entry = curList[curIdx]; if (!entry) return;
    const [title, src, kind] = entry.it;
    watched.add(wkey(entry.idx)); saveWatched();
    $("#pTitle").textContent = title;
    renderPList();
    teardown();
    const v = $("#pVideo"), stage = $("#pStage");
    const open = '<br><a href="' + esc(kind === "y" ? "https://www.youtube.com/watch?v=" + src : src) + '" target="_blank" rel="noopener noreferrer">Open in new tab</a>';
    if (kind === "y") {
      v.style.display = "none";
      const f = document.createElement("iframe");
      f.src = "https://www.youtube.com/embed/" + encodeURIComponent(src) + "?autoplay=1&rel=0&playsinline=1";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true; f.referrerPolicy = "strict-origin-when-cross-origin";
      stage.appendChild(f); return;
    }
    if (kind === "p") {
      v.style.display = "none";
      const f = document.createElement("iframe");
      f.src = src; f.allow = "autoplay; fullscreen; picture-in-picture"; f.allowFullscreen = true; f.referrerPolicy = "no-referrer";
      stage.appendChild(f);
      showMsg("This lecture plays on its own page. If it does not load here:" + open); setTimeout(() => $("#pMsg").classList.remove("show"), 4500); return;
    }
    v.style.display = "block";
    const speed = +$("#pSpeed").value || 1;
    const start = () => { v.playbackRate = speed; v.play().catch(() => {}); };
    try {
      if (/\.m3u8(\?|$)/i.test(src) && !v.canPlayType("application/vnd.apple.mpegurl")) {
        await loadHls();
        if (window.Hls && window.Hls.isSupported()) {
          hls = new window.Hls({ maxBufferLength: 40 });
          hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) showMsg("This lecture could not be loaded right now." + open); });
          hls.loadSource(src); hls.attachMedia(v);
          hls.on(window.Hls.Events.MANIFEST_PARSED, start);
          return;
        }
      }
      v.src = src; v.onloadedmetadata = start; v.onerror = () => showMsg("This lecture could not be loaded right now." + open);
    } catch (e) { showMsg("Player could not start." + open); }
  }
  function renderPList() {
    const l = $("#pList");
    l.innerHTML = curList.map((e, n) => '<div class="row item' + (n === curIdx ? " now" : "") + '" data-p="' + n + '" role="button" tabindex="0"><span class="num">' + (e.idx + 1) + '</span><span class="row-main"><span class="row-name">' + esc(e.it[0]) + "</span></span></div>").join("");
    l.querySelectorAll("[data-p]").forEach((el) => el.addEventListener("click", () => { curIdx = +el.dataset.p; playCurrent(); }));
    const now = l.querySelector(".now"); if (now) now.scrollIntoView({ block: "nearest" });
    $("#pPrev").disabled = curIdx <= 0; $("#pNext").disabled = curIdx >= curList.length - 1;
  }
  function closePlayer(fromPop) {
    teardown(); $("#player").classList.remove("open"); document.body.style.overflow = "";
    if (!fromPop && history.state && history.state.p) history.back();
    if (state.s !== null) render();
  }
  $("#pClose").addEventListener("click", () => closePlayer(false));
  $("#pPrev").addEventListener("click", () => { if (curIdx > 0) { curIdx--; playCurrent(); } });
  $("#pNext").addEventListener("click", () => { if (curIdx < curList.length - 1) { curIdx++; playCurrent(); } });
  $("#pSpeed").addEventListener("change", (e) => { $("#pVideo").playbackRate = +e.target.value; });
  $("#pVideo").addEventListener("ended", () => { if (curIdx < curList.length - 1) { curIdx++; playCurrent(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#player").classList.contains("open")) closePlayer(false); });

  init();
})();
