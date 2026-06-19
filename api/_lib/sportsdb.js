// ============================================================================
//  Fuente de datos PÚBLICA: TheSportsDB  (sin registro / sin clave personal)
// ----------------------------------------------------------------------------
//  Opción "B": la página va a buscar la info ella misma a una base de datos
//  de fútbol abierta. Usa la clave de prueba pública "3" (no requiere cuenta).
//  Se puede sobreescribir con TSDB_KEY si algún día usas una clave propia.
//
//  Qué trae bien (gratis):  partidos, resultados, racha de cada equipo.
//  Qué trae "según haya":    plantel/cumpleaños de jugadores.
//  Qué normalmente NO trae:  lesiones y cumpleaños del entrenador.
//
//  Todo se traduce al mismo formato que entiende js/engine.js.
// ============================================================================

const KEY = process.env.TSDB_KEY || "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

const LEAGUE_AVG_GOALS = Number(process.env.TSDB_LEAGUE_AVG || 1.35);

// Ligas que cargamos por defecto. El id se resuelve solo (descubrimiento), o
// puedes fijarlo por variable de entorno si lo conoces.
// IDs reales de TheSportsDB (verificados):
//   Chile Primera División = 4627  ·  FIFA World Cup = 4429
const LEAGUES = [
  {
    key: "worldcup",
    name: "Mundial FIFA",
    short: "MUN",
    color: "#7c3aed",
    envId: process.env.TSDB_WC_LEAGUE || "4429",
    country: null,
    match: "FIFA World Cup",
    season: process.env.TSDB_WC_SEASON || "2026",
  },
  {
    key: "chile",
    name: "Primera División (Chile)",
    short: "CHI",
    color: "#dc2626",
    envId: process.env.TSDB_CHILE_LEAGUE || "4627",
    country: "Chile",
    match: "Chile Primera Division",
    season: process.env.TSDB_CHILE_SEASON || "2025",
  },
];

// --- caché en memoria -------------------------------------------------------
const _cache = new Map();
const _leagueIds = new Map(); // key -> idLeague resuelto

async function tsdb(path, ttlMs = 6 * 60 * 60 * 1000) {
  const url = BASE + path;
  const hit = _cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  const r = await fetch(url, { headers: { "User-Agent": "asesor-apuestas/1.0" } });
  if (!r.ok) {
    const e = new Error("HTTP " + r.status);
    e.code = "HTTP_" + r.status;
    throw e;
  }
  const j = await r.json();
  _cache.set(url, { exp: Date.now() + ttlMs, data: j });
  return j;
}

// Resuelve el id numérico de la liga (env > descubrimiento por país/nombre).
async function resolveLeagueId(league) {
  if (league.envId) return league.envId;
  if (_leagueIds.has(league.key)) return _leagueIds.get(league.key);

  let candidates = [];
  try {
    if (league.country) {
      const d = await tsdb(`/search_all_leagues.php?c=${encodeURIComponent(league.country)}&s=Soccer`, 7 * 24 * 3600 * 1000);
      candidates = d.countries || d.leagues || [];
    } else {
      const d = await tsdb(`/all_leagues.php`, 7 * 24 * 3600 * 1000);
      candidates = (d.leagues || []).filter((l) => (l.strSport || "") === "Soccer");
    }
  } catch (e) {
    candidates = [];
  }

  const want = league.match.toLowerCase();
  const found =
    candidates.find((l) => (l.strLeague || "").toLowerCase() === want) ||
    candidates.find((l) => (l.strLeague || "").toLowerCase().includes(want));
  const id = found && found.idLeague ? String(found.idLeague) : null;
  if (id) _leagueIds.set(league.key, id);
  return id;
}

const eventsOf = (d) => (d && (d.events || d.results)) || [];

module.exports = {
  tsdb,
  resolveLeagueId,
  eventsOf,
  LEAGUES,
  LEAGUE_AVG_GOALS,
  KEY,
};
