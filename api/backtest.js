// ============================================================================
//  GET /api/backtest?league=<key>&season=<año?>
//  SIMULADOR para comprobar la veracidad del algoritmo:
//  recorre los partidos YA JUGADOS de la temporada en orden cronológico y,
//  para cada uno, predice usando SOLO la información previa a ese partido
//  (sin "ver el futuro"). Luego compara con el resultado real y entrega
//  métricas de acierto. Una sola llamada a la API (cacheada).
// ============================================================================

const { apiGet, hasKey, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/apiFootball");
const { normalizeFixture } = require("./_lib/normalize");
const { predictStrength } = require("./_lib/model");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");

  const leagueKey = (req.query && req.query.league) || "chile";
  const league = LEAGUES.find((l) => l.key === leagueKey) || LEAGUES[0];
  const season = Number((req.query && req.query.season) || league.season);

  if (!hasKey()) {
    return res.status(200).json({ source: "demo", reason: "NO_KEY", league: league.name });
  }

  let raw;
  try {
    raw = await apiGet(`/fixtures?league=${league.id}&season=${season}`);
  } catch (e) {
    return res.status(200).json({ source: "error", message: String(e.message || e), league: league.name });
  }

  const finished = raw
    .map((r) => normalizeFixture(r, league))
    .filter((f) => f.finished && f.goals.home != null && f.goals.away != null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (finished.length < 10) {
    return res.status(200).json({
      source: "api",
      league: league.name,
      season,
      message: "No hay suficientes partidos jugados en esta temporada para el simulador.",
      metrics: null,
      sample: [],
      played: finished.length,
    });
  }

  // Ancla de goles de la liga (constante de escala).
  let tg = 0;
  finished.forEach((f) => (tg += f.goals.home + f.goals.away));
  const leagueAvg = tg / (2 * finished.length) || LEAGUE_AVG_GOALS;

  // Estado rolling: solo partidos PREVIOS de cada equipo.
  const agg = {}; // teamId -> { gf, ga, n }
  const MIN = 3; // mínimo de partidos previos para predecir

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

      // Brier multiclase y log-loss (miden CALIBRACIÓN, no solo aciertos).
      const P = pred.probs;
      const y = { home: actual === "1" ? 1 : 0, draw: actual === "X" ? 1 : 0, away: actual === "2" ? 1 : 0 };
      brier += sq(P.home - y.home) + sq(P.draw - y.draw) + sq(P.away - y.away);
      const pActual = actual === "1" ? P.home : actual === "X" ? P.draw : P.away;
      logloss += -Math.log(Math.max(1e-6, pActual));

      rows.push({
        date: f.date,
        home: f.home.name, away: f.away.name,
        probs: { home: round(P.home), draw: round(P.draw), away: round(P.away) },
        pick: pred.pick,
        predScore: pred.topScore,
        actual,
        score: `${f.goals.home}-${f.goals.away}`,
        hit: pred.pick === actual,
      });
    }

    // Actualizar DESPUÉS de predecir (evita fuga de información).
    bump(agg, f.home.id, f.goals.home, f.goals.away);
    bump(agg, f.away.id, f.goals.away, f.goals.home);
  }

  const metrics = n
    ? {
        evaluated: n,
        accuracy1x2: round(hit1x2 / n),
        baselineHome: round(baseHome / n), // acierto si SIEMPRE eliges local
        exactScore: round(hitExact / n),
        brier: round(brier / n),         // 0 = perfecto; ~0.66 = azar puro (3 vías)
        logloss: round(logloss / n),     // menor = mejor; ~1.10 = azar puro
      }
    : null;

  return res.status(200).json({
    source: "api",
    league: league.name,
    season,
    played: finished.length,
    metrics,
    // Mostramos los últimos 30 para no saturar la página.
    sample: rows.slice(-30).reverse(),
  });
};

function bump(agg, id, gf, ga) {
  if (id == null) return;
  if (!agg[id]) agg[id] = { gf: 0, ga: 0, n: 0 };
  agg[id].gf += gf;
  agg[id].ga += ga;
  agg[id].n += 1;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sq(x) { return x * x; }
function round(x) { return Math.round(x * 1000) / 1000; }
