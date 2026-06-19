// ============================================================================
//  GET /api/match?home=<teamId>&away=<teamId>&league=<key>
//  "Analizar a fondo" con la fuente pública (TheSportsDB):
//  busca la racha y la fuerza de cada equipo (últimos partidos) y, si la
//  fuente lo permite, el plantel con cumpleaños. El navegador corre el motor.
// ============================================================================

const { tsdb, LEAGUES, LEAGUE_AVG_GOALS } = require("./_lib/sportsdb");
const { teamFromEvents, tsdbPlayers, short } = require("./_lib/normalize");

async function safe(path, fallback, ttl) {
  try { return await tsdb(path, ttl); } catch (e) { return fallback; }
}

async function buildTeam(teamId, league, color) {
  const day = 24 * 3600 * 1000;
  const [lastRaw, playersRaw, teamRaw] = await Promise.all([
    safe(`/eventslast.php?id=${teamId}`, {}, 3 * 3600 * 1000),
    safe(`/lookup_all_players.php?id=${teamId}`, {}, day),
    safe(`/lookupteam.php?id=${teamId}`, {}, 7 * day),
  ]);

  const events = (lastRaw && lastRaw.results) || [];
  const form = teamFromEvents(events, teamId, LEAGUE_AVG_GOALS);
  const players = tsdbPlayers(playersRaw && playersRaw.player);

  const teamInfo = (teamRaw && teamRaw.teams && teamRaw.teams[0]) || {};
  const name = teamInfo.strTeam || (events[0] && (String(events[0].idHomeTeam) === String(teamId) ? events[0].strHomeTeam : events[0].strAwayTeam)) || "Equipo";
  // TheSportsDB a veces trae el técnico en strManager (puede venir vacío).
  const coachName = teamInfo.strManager || null;

  return {
    id: String(teamId),
    name,
    short: short(name),
    color,
    attack: form.attack,
    defense: form.defense,
    coach: { name: coachName || "Cuerpo técnico", birthday: null },
    lastResults: form.lastResults,
    restDays: 4,
    players,
    _played: form.played,
    _hasPlayers: players.length > 0,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");

  const { home, away, league: leagueKey } = req.query || {};
  if (!home || !away) {
    return res.status(400).json({ error: "Faltan parámetros home/away (IDs de equipo)." });
  }
  const league = LEAGUES.find((l) => l.key === leagueKey) || LEAGUES[0];

  try {
    const [homeTeam, awayTeam] = await Promise.all([
      buildTeam(home, league, "#2563eb"),
      buildTeam(away, league, "#f59e0b"),
    ]);
    return res.status(200).json({
      source: "api",
      provider: "TheSportsDB (datos públicos)",
      leagueName: league.name,
      leagueAvg: LEAGUE_AVG_GOALS,
      // Avisos de cobertura de la fuente gratis (honestidad sobre los datos).
      coverage: {
        players: homeTeam._hasPlayers && awayTeam._hasPlayers,
        injuries: false,
        coachBirthday: false,
      },
      home: homeTeam,
      away: awayTeam,
    });
  } catch (e) {
    return res.status(200).json({ source: "error", message: String(e.message || e) });
  }
};
