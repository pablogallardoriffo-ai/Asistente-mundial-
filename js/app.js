// ============================================================================
//  INTERFAZ · Vista de Partidos
//  - Carga partidos reales desde /api/fixtures (Mundial + Chile).
//  - Si no hay clave/datos, usa los datos demo (window.DB) con aviso.
//  - "Analizar a fondo" pide /api/match y corre el motor rico en el navegador.
// ============================================================================

(function () {
  const ENGINE = window.ENGINE;
  const state = { source: "demo", fixtures: [], leagues: [], filter: "all" };

  const pct = (x) => `${Math.round(x * 100)}%`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function confidence(p) {
    if (p >= 0.55) return { text: "Alta", cls: "conf-high" };
    if (p >= 0.42) return { text: "Media", cls: "conf-mid" };
    return { text: "Baja / parejo", cls: "conf-low" };
  }

  function bar(probs, hShort, aShort) {
    return `
      <div class="bar">
        <div class="seg seg-home" style="width:${probs.home * 100}%" title="Gana ${esc(hShort)}">${pct(probs.home)}</div>
        <div class="seg seg-draw" style="width:${probs.draw * 100}%" title="Empate">${pct(probs.draw)}</div>
        <div class="seg seg-away" style="width:${probs.away * 100}%" title="Gana ${esc(aShort)}">${pct(probs.away)}</div>
      </div>`;
  }

  // ---------- BADGE de origen de datos ----------
  function setBadge() {
    const b = document.getElementById("source-badge");
    if (state.source === "api") {
      b.className = "badge badge-live";
      b.textContent = "🟢 Datos reales (API-Football)";
    } else {
      b.className = "badge badge-demo";
      b.textContent = "🟡 Datos de ejemplo (configura la clave para datos reales)";
    }
  }

  // ---------- FILTROS por liga ----------
  function renderFilters() {
    const cont = document.getElementById("league-filters");
    const ligas = state.leagues.length
      ? state.leagues
      : [{ key: "all", name: "Todos" }];
    const chips = [{ key: "all", name: "Todas las ligas" }].concat(ligas);
    cont.innerHTML = chips
      .map(
        (l) =>
          `<button class="chip ${state.filter === l.key ? "chip-on" : ""}" data-league="${l.key}">${esc(l.name)}${l.count != null ? ` <small>(${l.count})</small>` : ""}</button>`
      )
      .join("");
    cont.querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => {
        state.filter = c.dataset.league;
        renderFilters();
        renderMatches();
      })
    );
  }

  // ---------- TARJETA: pronóstico rápido (listado real) ----------
  function quickCard(f) {
    const q = f.quick;
    const leagueChip = `<span class="lchip" style="background:${esc(f.leagueColor || "#334155")}">${esc(f.leagueName || "")}</span>`;
    let predBlock;
    if (q && q.probs) {
      const best =
        q.pick === "1" ? { who: `Gana ${esc(f.home.short)}`, p: q.probs.home }
        : q.pick === "2" ? { who: `Gana ${esc(f.away.short)}`, p: q.probs.away }
        : { who: "Empate", p: q.probs.draw };
      const conf = confidence(best.p);
      predBlock = `
        <div class="recommend ${conf.cls}">
          Pronóstico rápido: <strong>${best.who}</strong>
          <span class="confidence">Confianza: ${conf.text}</span>
        </div>
        ${bar(q.probs, f.home.short, f.away.short)}
        <div class="quickmeta">Marcador más probable: <strong>${esc(q.topScore)}</strong> · Over 2.5: <strong>${pct(q.over25)}</strong></div>`;
    } else {
      predBlock = `<div class="recommend conf-low">Sin historial suficiente para un pronóstico todavía.</div>`;
    }

    return `
    <article class="card" data-id="${esc(f.id)}">
      <header class="card-head">
        <div class="teams">
          <strong>${esc(f.home.name)}</strong>
          <span class="vs">vs</span>
          <strong>${esc(f.away.name)}</strong>
        </div>
        <div class="meta">${leagueChip} ${esc(f.date)} · ${esc(f.time)}${f.stadium ? " · " + esc(f.stadium) : ""}</div>
      </header>
      ${predBlock}
      <div class="deep-slot">
        <button class="btn deepen" data-home="${esc(f.home.id)}" data-away="${esc(f.away.id)}" data-league="${esc(f.leagueKey)}">
          🔍 Analizar a fondo (jugadores, DT, lesiones, racha)
        </button>
      </div>
    </article>`;
  }

  // ---------- TARJETA: pronóstico completo (motor rico) ----------
  function fullCardHTML(pred, meta) {
    const { home, away, probs } = pred;
    const best =
      probs.home >= probs.draw && probs.home >= probs.away ? { who: `Gana ${esc(home.short)}`, p: probs.home }
      : probs.away >= probs.draw && probs.away >= probs.home ? { who: `Gana ${esc(away.short)}`, p: probs.away }
      : { who: "Empate", p: probs.draw };
    const conf = confidence(best.p);

    const scores = pred.topScores
      .map((s, i) => `<span class="score-chip ${i === 0 ? "score-top" : ""}">${esc(s.label)}<small>${pct(s.prob)}</small></span>`)
      .join("");

    const args = pred.arguments
      .map((a) => `<li>${esc(a).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`)
      .join("");

    return `
      <div class="metaline">${meta || ""}</div>
      <div class="pred-row">
        <div class="pred-main">
          <div class="recommend ${conf.cls}">
            Pronóstico: <strong>${best.who}</strong>
            <span class="confidence">Confianza: ${conf.text}</span>
          </div>
          ${bar(probs, home.short, away.short)}
          <div class="legend">
            <span><i class="sw seg-home"></i> ${esc(home.short)} (cuota justa ${pred.fairOdds.home})</span>
            <span><i class="sw seg-draw"></i> Empate (${pred.fairOdds.draw})</span>
            <span><i class="sw seg-away"></i> ${esc(away.short)} (${pred.fairOdds.away})</span>
          </div>
        </div>
        <div class="pred-side">
          <div class="side-block">
            <h4>Marcadores más probables</h4>
            <div class="scores">${scores}</div>
          </div>
          <div class="side-block">
            <h4>Goles del partido</h4>
            <div class="ou"><span>Over 2.5: <strong>${pct(pred.over25)}</strong></span><span>Under 2.5: <strong>${pct(pred.under25)}</strong></span></div>
          </div>
        </div>
      </div>
      <details class="args" open>
        <summary>¿Por qué? Argumentos del modelo</summary>
        <ul>${args}</ul>
      </details>
      ${squadHTML(home)}
      ${squadHTML(away)}`;
  }

  function squadHTML(team) {
    if (!team.players || !team.players.length) return "";
    const dt = team.coach && team.coach.name ? `<span class="dt">DT: ${esc(team.coach.name)}${team.coach.birthday ? " · 🎂 " + esc(team.coach.birthday) : ""}</span>` : "";
    const rows = team.players
      .map(
        (p) =>
          `<li class="${p.injured ? "inj" : ""}"><span class="pn">${esc(p.name)}</span> <span class="pp">${esc(p.pos)}</span> <span class="pf">forma ${p.form}</span>${p.injured ? ' <span class="tag-inj">lesión</span>' : ""}${p.birthday ? ` <span class="pb">🎂 ${esc(p.birthday)}</span>` : ""}</li>`
      )
      .join("");
    return `
      <details class="squad">
        <summary>Plantel · ${esc(team.name)} ${dt}</summary>
        <ul class="players">${rows}</ul>
      </details>`;
  }

  // ---------- Acción "Analizar a fondo" ----------
  async function deepen(btn) {
    const card = btn.closest(".card");
    const { home, away, league } = btn.dataset;
    btn.disabled = true;
    btn.textContent = "Buscando datos de jugadores, DT, lesiones y racha…";
    try {
      const r = await fetch(`/api/match?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&league=${encodeURIComponent(league)}`);
      const data = await r.json();
      if (data.source !== "api" || !data.home) throw new Error(data.message || "Sin datos");
      // El partido ya tiene fecha/estadio en la tarjeta; los recuperamos.
      const f = state.fixtures.find((x) => String(x.home.id) === String(home) && String(x.away.id) === String(away));
      const meta = { date: f && f.date, time: f && f.time, stadium: f && f.stadium, importance: f ? f.importance : 6 };
      const pred = ENGINE.predictTeams(data.home, data.away, meta, data.leagueAvg);
      const metaLine = `${esc((f && f.leagueName) || data.leagueName || "")} · ${esc((f && f.date) || "")} ${esc((f && f.time) || "")}${f && f.stadium ? " · " + esc(f.stadium) : ""}`;
      // Reemplaza el contenido de la tarjeta con el análisis completo.
      card.classList.add("expanded");
      card.querySelector(".deep-slot").remove();
      const block = document.createElement("div");
      block.className = "full";
      block.innerHTML = fullCardHTML(pred, metaLine);
      card.appendChild(block);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "🔁 Reintentar análisis a fondo";
      const w = document.createElement("div");
      w.className = "warn";
      w.textContent = "No se pudieron obtener todos los datos (posible límite de la API o falta de plantel). " + (e.message || "");
      card.appendChild(w);
    }
  }

  // ---------- Render principal ----------
  function renderMatches() {
    const root = document.getElementById("matches");
    const note = document.getElementById("matches-note");

    if (state.source === "api") {
      const list = state.fixtures.filter((f) => state.filter === "all" || f.leagueKey === state.filter);
      if (!list.length) {
        root.innerHTML = `<div class="empty">No hay próximos partidos para esta selección. Puede que la temporada no esté activa o tu plan de API no incluya esta temporada. Prueba el simulador con una temporada pasada.</div>`;
        note.textContent = "";
        return;
      }
      note.textContent = `${list.length} partidos · pulsa "Analizar a fondo" en cualquiera para el desglose completo.`;
      root.innerHTML = list.map(quickCard).join("");
      root.querySelectorAll(".deepen").forEach((b) => b.addEventListener("click", () => deepen(b)));
    } else {
      // ----- Fallback DEMO -----
      const DB = window.DB;
      note.textContent = "Mostrando partidos de EJEMPLO. Configura la clave de API en Vercel para ver Mundial y liga chilena reales.";
      root.innerHTML = DB.FIXTURES.map((f) => {
        const pred = ENGINE.predictMatch(f, DB);
        const card = document.createElement("div");
        card.className = "card expanded";
        card.innerHTML = `<header class="card-head"><div class="teams"><strong>${esc(pred.home.name)}</strong><span class="vs">vs</span><strong>${esc(pred.away.name)}</strong></div><div class="meta">${esc(f.date)} · ${esc(f.time)} · ${esc(f.stadium)}</div></header><div class="full">${fullCardHTML(pred, "")}</div>`;
        return card.outerHTML;
      }).join("");
    }
  }

  // ---------- Carga inicial ----------
  async function load() {
    try {
      const r = await fetch("/api/fixtures");
      const data = await r.json();
      state.source = data.source === "api" && data.fixtures.length ? "api" : "demo";
      state.fixtures = data.fixtures || [];
      state.leagues = data.leagues || [];
      if (data.source !== "api" && data.message) console.info("Fixtures:", data.message);
    } catch (e) {
      state.source = "demo";
    }
    setBadge();
    renderFilters();
    renderMatches();
  }

  // ---------- Tabs ----------
  function initTabs() {
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        const view = t.dataset.view;
        document.getElementById("view-matches").classList.toggle("hidden", view !== "matches");
        document.getElementById("view-simulator").classList.toggle("hidden", view !== "simulator");
      })
    );
    document.getElementById("refresh").addEventListener("click", load);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    load();
  });

  // Exponer utilidades para backtest.js
  window.APP = { pct, esc, confidence };
})();
