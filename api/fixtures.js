// ============================================================================
//  GET /api/fixtures
//  Devuelve los próximos partidos de las ligas configuradas (Mundial + Chile)
//  con un pronóstico RÁPIDO (Poisson sobre la fuerza de cada equipo en la
//  temporada). Una sola llamada por liga, cacheada, para cuidar el plan gratis.
// ============================================================================

const { apiGet, hasKey, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/apiFootball");
const { normalizeFixture } = require("./_lib/normalize");
const { predictStrength } = require("./_lib/model");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");

  if (!hasKey()) {
    return res.status(200).json({
      source: "demo",
      reason: "NO_KEY",
      message:
        "No hay clave de API configurada. Configura FOOTBALL_API_KEY en Vercel para datos reales.",
      leagues: LEAGUES.map((l) => ({ key: l.key, name: l.name, season: l.season, color: l.color })),
      fixtures: [],
    });
  }

  try {
    const allFixtures = [];
    const leaguesMeta = [];

    for (const league of LEAGUES) {
      let raw = [];
      try {
        raw = await apiGet(`/fixtures?league=${league.id}&season=${league.season}`);
      } catch (e) {
        leaguesMeta.push({ key: league.key, name: league.name, season: league.season, color: league.color, error: e.code || "ERROR", count: 0 });
        continue;
      }

      const fixtures = raw.map((r) => normalizeFixture(r, league));

      // --- fuerzas de equipo desde partidos ya jugados de la temporada ------
      const agg = {}; // teamId -> { gf, ga, n }
      let totalGoals = 0, totalMatches = 0;
      fixtures.forEach((f) => {
        if (!f.finished || f.goals.home == null || f.goals.away == null) return;
        totalGoals += f.goals.home + f.goals.away;
        totalMatches += 1;
        push(agg, f.home.id, f.goals.home, f.goals.away);
        push(agg, f.away.id, f.goals.away, f.goals.home);
      });
      const leagueAvg = totalMatches ? totalGoals / (2 * totalMatches) : LEAGUE_AVG_GOALS;

      // --- próximos partidos con pronóstico rápido --------------------------
      const now = Date.now() / 1000 - 3 * 3600; // tolerancia de 3h
      const upcoming = fixtures
        .filter((f) => !f.finished && f.timestamp >= now)
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, 30);

      upcoming.forEach((f) => {
        const h = strength(agg, f.home.id, leagueAvg);
        const a = strength(agg, f.away.id, leagueAvg);
        if (h && a) {
          f.quick = predictStrength(h.attack, h.defense, a.attack, a.defense, leagueAvg);
        } else {
          f.quick = null; // sin historial suficiente todavía
        }
        if (league.key === "worldcup") f.importance = 8;
        allFixtures.push(f);
      });

      leaguesMeta.push({ key: league.key, name: league.name, season: league.season, color: league.color, count: upcoming.length });
    }

    allFixtures.sort((a, b) => a.timestamp - b.timestamp);

    return res.status(200).json({
      source: "api",
      generatedAt: new Date().toISOString(),
      leagueAvg: LEAGUE_AVG_GOALS,
      leagues: leaguesMeta,
      fixtures: allFixtures,
    });
  } catch (e) {
    return res.status(200).json({ source: "demo", reason: e.code || "ERROR", message: String(e.message || e), leagues: [], fixtures: [] });
  }
};

function push(agg, id, gf, ga) {
  if (id == null) return;
  if (!agg[id]) agg[id] = { gf: 0, ga: 0, n: 0 };
  agg[id].gf += gf;
  agg[id].ga += ga;
  agg[id].n += 1;
}
function strength(agg, id, leagueAvg) {
  const a = agg[id];
  if (!a || a.n < 2) return null;
  const avgFor = a.gf / a.n;
  const avgAgainst = a.ga / a.n;
  return {
    attack: clamp(avgFor / leagueAvg, 0.4, 2.2),
    defense: clamp(leagueAvg / Math.max(0.3, avgAgainst), 0.4, 2.2),
  };
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
