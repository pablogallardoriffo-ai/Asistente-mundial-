// ============================================================================
//  GET /api/backtest?league=<key>&season=<temporada?>
//  SIMULADOR con la fuente pública (TheSportsDB): recorre los partidos ya
//  jugados de una temporada y predice cada uno con SOLO datos previos (sin
//  ver el futuro), comparando con el resultado real. Métricas de acierto.
// ============================================================================

const { tsdb, resolveLeagueId, eventsOf, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/sportsdb");
const { tsdbEvent } = require("./_lib/normalize");
const { predictStrength } = require("./_lib/model");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");

  const leagueKey = (req.query && req.query.league) || "chile";
  const league = LEAGUES.find((l) => l.key === leagueKey) || LEAGUES[0];
  const season = (req.query && req.query.season) || league.season;

  let id, raw;
  try {
    id = await resolveLeagueId(league);
    if (!id) return res.status(200).json({ source: "api", league: league.name, season, metrics: null, sample: [], message: "No se encontró la liga en la fuente pública." });
    raw = await tsdb(`/eventsseason.php?id=${id}&s=${encodeURIComponent(season)}`, 24 * 3600 * 1000);
  } catch (e) {
    return res.status(200).json({ source: "error", message: String(e.message || e), league: league.name });
  }

  const finished = eventsOf(raw)
    .map((e) => tsdbEvent(e, league))
    .filter((f) => f.finished && f.goals.home != null && f.goals.away != null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (finished.length < 10) {
    return res.status(200).json({
      source: "api", provider: "TheSportsDB (datos públicos)", league: league.name, season,
      metrics: null, sample: [], played: finished.length,
      message: `Pocos partidos jugados para esta temporada (${finished.length}). Prueba otra temporada (ej. 2023-2024).`,
    });
  }

  let tg = 0;
  finished.forEach((f) => (tg += f.goals.home + f.goals.away));
  const leagueAvg = tg / (2 * finished.length) || LEAGUE_AVG_GOALS;

  const agg = {};
  const MIN = 3;
  let n = 0, hit1x2 = 0, hitExact = 0, brier = 0, logloss = 0, baseHome = 0;
  const rows = [];

  for (const f of finished) {
    const H = agg[f.home.id], A = agg[f.away.id];
    const actual = f.goals.home > f.goals.away ? "1" : f.goals.home < f.goals.away ? "2" : "X";

    if (H && A && H.n >= MIN && A.n >= MIN) {
      const hs = { attack: clamp(H.gf / H.n / leagueAvg, 0.4, 2.2), defense: clamp(leagueAvg / Math.max(0.3, H.ga / H.n), 0.4, 2.2) };
      const as = { attack: clamp(A.gf / A.n / leagueAvg, 0.4, 2.2), defense: clamp(leagueAvg / Math.max(0.3, A.ga / A.n), 0.4, 2.2) };
      const pred = predictStrength(hs.attack, hs.defense, as.attack, as.defense, leagueAvg);

      n += 1;
      if (pred.pick === actual) hit1x2 += 1;
      if (pred.topScore === `${f.goals.home}-${f.goals.away}`) hitExact += 1;
      if (actual === "1") baseHome += 1;

      const P = pred.probs;
      const y = { home: actual === "1" ? 1 : 0, draw: actual === "X" ? 1 : 0, away: actual === "2" ? 1 : 0 };
      brier += sq(P.home - y.home) + sq(P.draw - y.draw) + sq(P.away - y.away);
      const pA = actual === "1" ? P.home : actual === "X" ? P.draw : P.away;
      logloss += -Math.log(Math.max(1e-6, pA));

      rows.push({
        date: f.date, home: f.home.name, away: f.away.name,
        probs: { home: round(P.home), draw: round(P.draw), away: round(P.away) },
        pick: pred.pick, predScore: pred.topScore,
        actual, score: `${f.goals.home}-${f.goals.away}`, hit: pred.pick === actual,
      });
    }

    bump(agg, f.home.id, f.goals.home, f.goals.away);
    bump(agg, f.away.id, f.goals.away, f.goals.home);
  }

  const metrics = n
    ? {
        evaluated: n,
        accuracy1x2: round(hit1x2 / n),
        baselineHome: round(baseHome / n),
        exactScore: round(hitExact / n),
        brier: round(brier / n),
        logloss: round(logloss / n),
      }
    : null;

  return res.status(200).json({
    source: "api",
    provider: "TheSportsDB (datos públicos)",
    league: league.name,
    season,
    played: finished.length,
    metrics,
    sample: rows.slice(-30).reverse(),
  });
};

function bump(agg, id, gf, ga) {
  if (id == null) return;
  if (!agg[id]) agg[id] = { gf: 0, ga: 0, n: 0 };
  agg[id].gf += gf; agg[id].ga += ga; agg[id].n += 1;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sq(x) { return x * x; }
function round(x) { return Math.round(x * 1000) / 1000; }
