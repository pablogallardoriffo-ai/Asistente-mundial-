// ============================================================================
//  GET /api/backtest?league=<key>&season=<temporada?>
//  SIMULADOR para comprobar la veracidad del algoritmo: recorre partidos ya
//  jugados y predice cada uno con SOLO datos previos (sin ver el futuro),
//  comparando con el resultado real.
//
//  La fuente pública gratuita recorta el histórico (entrega muy pocos
//  partidos por temporada), así que:
//    - Si hay suficiente histórico real -> backtest REAL de la liga.
//    - Si no -> DEMOSTRACIÓN del método con datos de ejemplo (claramente
//      etiquetada). Con una clave premium se corre sobre la liga real.
// ============================================================================

const { tsdb, resolveLeagueId, eventsOf, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/sportsdb");
const { tsdbEvent } = require("./_lib/normalize");
const { predictStrength } = require("./_lib/model");

const MIN_REAL = 12; // mínimo de partidos reales para un backtest creíble

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");

  const leagueKey = (req.query && req.query.league) || "chile";
  const league = LEAGUES.find((l) => l.key === leagueKey) || LEAGUES[0];
  const season = (req.query && req.query.season) || league.season;

  // --- intentar histórico REAL ---------------------------------------------
  let finished = [];
  try {
    const id = await resolveLeagueId(league);
    if (id) {
      const raw = await tsdb(`/eventsseason.php?id=${id}&s=${encodeURIComponent(season)}`, 24 * 3600 * 1000);
      let evs = eventsOf(raw);
      if (evs.length < 40) {
        const past = await tsdb(`/eventspastleague.php?id=${id}`, 6 * 3600 * 1000).catch(() => ({}));
        const seen = new Set(evs.map((e) => String(e.idEvent)));
        eventsOf(past).forEach((e) => { if (!seen.has(String(e.idEvent))) evs.push(e); });
      }
      finished = evs
        .map((e) => tsdbEvent(e, league))
        .filter((f) => f.finished && f.goals.home != null && f.goals.away != null)
        .sort((a, b) => a.timestamp - b.timestamp);
    }
  } catch (e) {
    finished = [];
  }

  if (finished.length >= MIN_REAL) {
    const r = runBacktest(finished);
    return res.status(200).json({
      source: "api",
      provider: "TheSportsDB (datos públicos)",
      demo: false,
      league: league.name,
      season,
      played: finished.length,
      metrics: r.metrics,
      sample: r.rows.slice(-30).reverse(),
    });
  }

  // --- DEMOSTRACIÓN del método (datos de ejemplo) --------------------------
  const demoFinished = generateDemoSeason();
  const r = runBacktest(demoFinished);
  return res.status(200).json({
    source: "api",
    provider: "Demostración (datos de ejemplo)",
    demo: true,
    league: "Liga de ejemplo (demostración del método)",
    season: "demo",
    played: demoFinished.length,
    realFound: finished.length,
    message:
      `La fuente pública gratuita solo entregó ${finished.length} partidos de ${league.name} ${season} ` +
      "(recorta el histórico), insuficientes para un backtest real. Te muestro el MÉTODO funcionando " +
      "sobre una liga de ejemplo. Con una clave premium (TheSportsDB Patreon o API-Football) se corre sobre la liga real completa.",
    metrics: r.metrics,
    sample: r.rows.slice(-30).reverse(),
  });
};

// --- lógica de backtest reutilizable (real o demo) -------------------------
function runBacktest(finished) {
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
  return { metrics, rows };
}

// --- generador determinista de una temporada de ejemplo --------------------
//  8 equipos con "fuerza" oculta, doble rueda, marcadores ~Poisson. Sirve para
//  demostrar que el método separa señal del ruido (gana al baseline).
function generateDemoSeason() {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const poissonSample = (lambda) => {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  };
  const teams = [
    { id: "d1", name: "Atlético Demo", str: 1.7 },
    { id: "d2", name: "Demo United", str: 1.45 },
    { id: "d3", name: "Real Ejemplo", str: 1.25 },
    { id: "d4", name: "Demo City", str: 1.1 },
    { id: "d5", name: "Sporting Test", str: 0.95 },
    { id: "d6", name: "Deportivo Muestra", str: 0.85 },
    { id: "d7", name: "Demo Rovers", str: 0.7 },
    { id: "d8", name: "Ejemplo FC", str: 0.55 },
  ];
  const base = 1.35;
  const fixtures = [];
  let ts = 1700000000;
  for (let round = 0; round < 2; round++) {
    for (const h of teams) {
      for (const a of teams) {
        if (h.id === a.id) continue;
        const lambdaH = base * (h.str / a.str) * 1.15;
        const lambdaA = base * (a.str / h.str) / 1.07;
        fixtures.push({
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          timestamp: ts,
          home: { id: h.id, name: h.name },
          away: { id: a.id, name: a.name },
          goals: { home: poissonSample(lambdaH), away: poissonSample(lambdaA) },
          finished: true,
        });
        ts += 2 * 24 * 3600;
      }
    }
  }
  return fixtures.sort((a, b) => a.timestamp - b.timestamp);
}

function bump(agg, id, gf, ga) {
  if (id == null) return;
  if (!agg[id]) agg[id] = { gf: 0, ga: 0, n: 0 };
  agg[id].gf += gf; agg[id].ga += ga; agg[id].n += 1;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function sq(x) { return x * x; }
function round(x) { return Math.round(x * 1000) / 1000; }
