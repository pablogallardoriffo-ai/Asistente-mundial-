// ============================================================================
//  INTERFAZ  (Asesor de Apuestas de Fútbol)
//  Dibuja el panel de partidos con su pronóstico y los argumentos.
// ============================================================================

(function () {
  const DB = window.DB;
  const ENGINE = window.ENGINE;

  const pct = (x) => `${(x * 100).toFixed(0)}%`;

  // Color según probabilidad (verde fuerte = más probable).
  function confidenceLabel(p) {
    if (p >= 0.55) return { text: "Alta", cls: "conf-high" };
    if (p >= 0.42) return { text: "Media", cls: "conf-mid" };
    return { text: "Baja / parejo", cls: "conf-low" };
  }

  // Barra 1X2 (gana local / empate / gana visita).
  function barHTML(probs) {
    return `
      <div class="bar">
        <div class="seg seg-home" style="width:${probs.home * 100}%" title="Gana local">${pct(probs.home)}</div>
        <div class="seg seg-draw" style="width:${probs.draw * 100}%" title="Empate">${pct(probs.draw)}</div>
        <div class="seg seg-away" style="width:${probs.away * 100}%" title="Gana visita">${pct(probs.away)}</div>
      </div>`;
  }

  function matchCard(pred) {
    const { home, away, fixture, probs } = pred;
    const best =
      probs.home >= probs.draw && probs.home >= probs.away
        ? { who: `Gana ${home.short}`, p: probs.home }
        : probs.away >= probs.draw && probs.away >= probs.home
        ? { who: `Gana ${away.short}`, p: probs.away }
        : { who: "Empate", p: probs.draw };
    const conf = confidenceLabel(best.p);

    const scoresHTML = pred.topScores
      .map(
        (s, idx) =>
          `<span class="score-chip ${idx === 0 ? "score-top" : ""}">${s.label}<small>${pct(s.prob)}</small></span>`
      )
      .join("");

    const argsHTML = pred.arguments
      .map((a) => `<li>${a.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`)
      .join("");

    return `
    <article class="card">
      <header class="card-head">
        <div class="teams">
          <span class="dot" style="background:${home.color}"></span>
          <strong>${home.name}</strong>
          <span class="vs">vs</span>
          <strong>${away.name}</strong>
          <span class="dot" style="background:${away.color}"></span>
        </div>
        <div class="meta">${fixture.date} · ${fixture.time} · ${fixture.stadium}</div>
      </header>

      <div class="pred-row">
        <div class="pred-main">
          <div class="recommend ${conf.cls}">
            Pronóstico: <strong>${best.who}</strong>
            <span class="confidence">Confianza: ${conf.text}</span>
          </div>
          ${barHTML(probs)}
          <div class="legend">
            <span><i class="sw seg-home"></i> Gana ${home.short} (cuota justa ${pred.fairOdds.home})</span>
            <span><i class="sw seg-draw"></i> Empate (${pred.fairOdds.draw})</span>
            <span><i class="sw seg-away"></i> Gana ${away.short} (${pred.fairOdds.away})</span>
          </div>
        </div>

        <div class="pred-side">
          <div class="side-block">
            <h4>Marcadores más probables</h4>
            <div class="scores">${scoresHTML}</div>
          </div>
          <div class="side-block">
            <h4>Goles del partido</h4>
            <div class="ou">
              <span>Over 2.5: <strong>${pct(pred.over25)}</strong></span>
              <span>Under 2.5: <strong>${pct(pred.under25)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <details class="args">
        <summary>¿Por qué? Ver argumentos del modelo</summary>
        <ul>${argsHTML}</ul>
        <p class="disclaimer">
          Estos números salen de un modelo estadístico (Poisson) que pondera forma,
          lesiones, racha, localía, descanso, cumpleaños e importancia del partido.
          Es un <strong>acercamiento probabilístico</strong>, no una certeza: el fútbol es impredecible.
        </p>
      </details>
    </article>`;
  }

  function render() {
    const root = document.getElementById("matches");
    const preds = DB.FIXTURES.map((f) => ENGINE.predictMatch(f, DB));
    root.innerHTML = preds.map(matchCard).join("");

    // Resumen arriba: cuántos partidos, fecha de análisis.
    document.getElementById("summary").textContent =
      `${preds.length} partidos analizados · datos al ${DB.TODAY}`;
  }

  document.addEventListener("DOMContentLoaded", render);
})();
