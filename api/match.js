// ============================================================================
//  GET /api/match?home=<teamId>&away=<teamId>&league=<key>
//  "Analizar a fondo": dispara la búsqueda de toda la data de ambos equipos
//  (estadísticas, plantel con jugadores, entrenador, lesiones y racha) y la
//  devuelve en el formato del motor. El navegador corre la predicción rica.
//
//  Cacheado 24h por equipo. Cada equipo cuesta ~4 llamadas a la API.
// ============================================================================

const { apiGet, hasKey, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/apiFootball");
const { normalizeTeamDeep } = require("./_lib/normalize");

// Llama a la API y, si falla, devuelve un valor por defecto (no rompe todo).
async function safe(path, fallback, ttl) {
  try {
    return await apiGet(path, ttl);
  } catch (e) {
    return fallback;
  }
}

async function buildTeam(teamId, league, color) {
  const day = 24 * 60 * 60 * 1000;
  const [statsArr, players, injuries, coach] = await Promise.all([
    safe(`/teams/statistics?team=${teamId}&league=${league.id}&season=${league.season}`, null, day),
    safe(`/players?team=${teamId}&season=${league.season}&page=1`, [], day),
    safe(`/injuries?team=${teamId}&season=${league.season}`, [], 6 * 3600 * 1000),
    safe(`/coachs?team=${teamId}`, [], 7 * day),
  ]);

  // /teams/statistics devuelve un objeto; el resto, arrays.
  const stats = statsArr && !Array.isArray(statsArr) ? statsArr : (Array.isArray(statsArr) ? statsArr[0] : null);
  const teamMeta = (stats && stats.team) || { id: teamId, name: "Equipo" };

  return normalizeTeamDeep({
    teamMeta,
    stats,
    players,
    injuries,
    coach,
    color,
    leagueAvg: LEAGUE_AVG_GOALS,
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");

  const { home, away, league: leagueKey } = req.query || {};
  if (!home || !away) {
    return res.status(400).json({ error: "Faltan parámetros home/away (IDs de equipo)." });
  }
  if (!hasKey()) {
    return res.status(200).json({ source: "demo", reason: "NO_KEY" });
  }

  const league = LEAGUES.find((l) => l.key === leagueKey) || LEAGUES[0];

  try {
    const [homeTeam, awayTeam] = await Promise.all([
      buildTeam(home, league, "#2563eb"),
      buildTeam(away, league, "#f59e0b"),
    ]);
    return res.status(200).json({
      source: "api",
      leagueName: league.name,
      leagueAvg: LEAGUE_AVG_GOALS,
      home: homeTeam,
      away: awayTeam,
    });
  } catch (e) {
    return res.status(200).json({ source: "error", message: String(e.message || e) });
  }
};
