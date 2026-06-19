// ============================================================================
//  INTERFAZ · Vista Simulador (backtest)
//  Pide /api/backtest y muestra métricas de acierto + tabla de partidos.
// ============================================================================

(function () {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pickLabel = (p) => (p === "1" ? "Local" : p === "2" ? "Visita" : "Empate");

  function metricCard(value, label, hint, good) {
    return `<div class="metric ${good ? "metric-good" : ""}">
      <div class="metric-val">${value}</div>
      <div class="metric-lbl">${esc(label)}</div>
      ${hint ? `<div class="metric-hint">${esc(hint)}</div>` : ""}
    </div>`;
  }

  function render(data) {
    const out = document.getElementById("sim-results");

    if (data.source !== "api") {
      out.innerHTML = `<div class="warn">El simulador necesita datos reales. Configura <code>FOOTBALL_API_KEY</code> en Vercel para activarlo.</div>`;
      return;
    }
    if (!data.metrics) {
      out.innerHTML = `<div class="empty">${esc(data.message || "Sin partidos suficientes en esta temporada.")} (jugados: ${data.played || 0})</div>`;
      return;
    }

    const m = data.metrics;
    const beatsBaseline = m.accuracy1x2 > m.baselineHome;

    const metrics = `
      <div class="metrics">
        ${metricCard(pct(m.accuracy1x2), "Acierto 1X2", `Baseline (siempre local): ${pct(m.baselineHome)}`, beatsBaseline)}
        ${metricCard(pct(m.exactScore), "Marcador exacto", "Acertar el resultado justo es difícil")}
        ${metricCard(m.brier, "Brier score", "0 = perfecto · ~0.66 = azar")}
        ${metricCard(m.logloss, "Log-loss", "Menor = mejor · ~1.10 = azar")}
        ${metricCard(m.evaluated, "Partidos evaluados", `de ${data.played} jugados`)}
      </div>`;

    const verdict = beatsBaseline
      ? `✅ En <strong>${esc(data.league)}</strong> (temporada ${esc(data.season)}), el modelo acierta el <strong>${pct(m.accuracy1x2)}</strong> de los 1X2, por encima del baseline de ${pct(m.baselineHome)}. El Brier de ${m.brier} (azar ≈ 0.66) indica que las probabilidades están razonablemente calibradas.`
      : `⚠️ En <strong>${esc(data.league)}</strong> (temporada ${esc(data.season)}), el modelo acierta ${pct(m.accuracy1x2)}, similar o por debajo del baseline (${pct(m.baselineHome)}). Esta liga/temporada es difícil de predecir solo con goles; conviene sumar más variables.`;

    const rows = data.sample
      .map(
        (r) => `
        <tr class="${r.hit ? "row-hit" : "row-miss"}">
          <td>${esc(r.date)}</td>
          <td class="tl">${esc(r.home)} <span class="muted">vs</span> ${esc(r.away)}</td>
          <td>${pct(r.probs.home)}/${pct(r.probs.draw)}/${pct(r.probs.away)}</td>
          <td>${pickLabel(r.pick)}</td>
          <td><strong>${esc(r.score)}</strong></td>
          <td>${r.hit ? "✅" : "❌"}</td>
        </tr>`
      )
      .join("");

    out.innerHTML = `
      ${metrics}
      <p class="verdict">${verdict}</p>
      <div class="table-wrap">
        <table class="bt-table">
          <thead><tr><th>Fecha</th><th>Partido</th><th>Prob (L/E/V)</th><th>Pronóstico</th><th>Real</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="disclaimer">
        El backtest predice cada partido usando <strong>solo datos previos</strong> a su fecha
        (sin fuga de información). Valida el núcleo estadístico (Poisson sobre la fuerza de cada
        equipo); la versión "a fondo" añade además jugadores, lesiones y contexto.
      </p>`;
  }

  async function run() {
    const out = document.getElementById("sim-results");
    const league = document.getElementById("sim-league").value;
    out.innerHTML = `<div class="loading">Corriendo simulación sobre la temporada… (puede tardar unos segundos)</div>`;
    try {
      const r = await fetch(`/api/backtest?league=${encodeURIComponent(league)}`);
      const data = await r.json();
      render(data);
    } catch (e) {
      out.innerHTML = `<div class="warn">Error al correr el simulador: ${esc(e.message || e)}</div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("sim-run");
    if (btn) btn.addEventListener("click", run);
  });
})();
