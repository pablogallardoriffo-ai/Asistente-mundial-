// ============================================================================
//  GET /api/fixtures
//  Próximos partidos de las ligas (Chile + Mundial) desde TheSportsDB
//  (fuente pública, sin clave) con pronóstico rápido (Poisson). La página
//  va a buscar los datos ella misma; sin registro.
// ============================================================================

const { tsdb, resolveLeagueId, eventsOf, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/sportsdb");
const { tsdbEvent } = require("./_lib/normalize");
const { predictStrength } = require("./_lib/model");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=10800, stale-while-revalidate=43200");

  const allFixtures = [];
  const leaguesMeta = [];

  for (const league of LEAGUES) {
    try {
      const id = await resolveLeagueId(league);
      if (!id) {
        leaguesMeta.push({ key: league.key, name: league.name, color: league.color, count: 0, error: "LIGA_NO_ENCONTRADA" });
        continue;
      }

      // Próximos + últimos jugados (para medir la fuerza de cada equipo).
      const [nextRaw, pastRaw] = await Promise.all([
        tsdb(`/eventsnextleague.php?id=${id}`).catch(() => ({})),
        tsdb(`/eventspastleague.php?id=${id}`).catch(() => ({})),
      ]);

      const past = eventsOf(pastRaw).map((e) => tsdbEvent(e, league));
      const next = eventsOf(nextRaw).map((e) => tsdbEvent(e, league));

      // Fuerza de equipos desde lo ya jugado.
      const agg = {};
      let tg = 0, tm = 0;
      past.forEach((f) => {
        if (!f.finished) return;
        tg += f.goals.home + f.goals.away; tm += 1;
        bump(agg, f.home.id, f.goals.home, f.goals.away);
        bump(agg, f.away.id, f.goals.away, f.goals.home);
      });
      const leagueAvg = tm ? tg / (2 * tm) : LEAGUE_AVG_GOALS;

      const now = Date.now() / 1000 - 3 * 3600;
      const upcoming = next
        .filter((f) => !f.finished && (!f.timestamp || f.timestamp >= now))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(0, 25);

      upcoming.forEach((f) => {
        const h = strength(agg, f.home.id, leagueAvg);
        const a = strength(agg, f.away.id, leagueAvg);
        f.quick = h && a ? predictStrength(h.attack, h.defense, a.attack, a.defense, leagueAvg) : null;
        allFixtures.push(f);
      });

      leaguesMeta.push({ key: league.key, name: league.name, color: league.color, count: upcoming.length });
    } catch (e) {
      leaguesMeta.push({ key: league.key, name: league.name, color: league.color, count: 0, error: e.code || "ERROR" });
    }
  }

  allFixtures.sort((a, b) => a.timestamp - b.timestamp);

  return res.status(200).json({
    source: allFixtures.length ? "api" : "demo",
    provider: "TheSportsDB (datos públicos)",
    generatedAt: new Date().toISOString(),
    leagueAvg: LEAGUE_AVG_GOALS,
    leagues: leaguesMeta,
    fixtures: allFixtures,
  });
};

function bump(agg, id, gf, ga) {
  if (id == null) return;
  if (!agg[id]) agg[id] = { gf: 0, ga: 0, n: 0 };
  agg[id].gf += gf; agg[id].ga += ga; agg[id].n += 1;
}
function strength(agg, id, leagueAvg) {
  const a = agg[id];
  if (!a || a.n < 2) return null;
  return {
    attack: clamp(a.gf / a.n / leagueAvg, 0.4, 2.2),
    defense: clamp(leagueAvg / Math.max(0.3, a.ga / a.n), 0.4, 2.2),
  };
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
