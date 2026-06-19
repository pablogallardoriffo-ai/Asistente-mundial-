// ============================================================================
//  Cliente de API-Football  (se ejecuta SOLO en el servidor de Vercel)
// ----------------------------------------------------------------------------
//  - La clave NUNCA llega al navegador: vive en la variable de entorno
//    FOOTBALL_API_KEY (configúrala en Vercel → Settings → Environment Variables).
//  - Caché en memoria por instancia para no agotar el plan gratis (100/día).
//  - Las ligas y temporadas se pueden ajustar por variables de entorno sin
//    tocar el código (ver más abajo).
// ============================================================================

const BASE = process.env.APIFB_BASE || "https://v3.football.api-sports.io";
const KEY = process.env.FOOTBALL_API_KEY || process.env.APIFB_KEY || "";

// Ligas que cargamos por defecto. IDs de API-Football:
//   Mundial FIFA = 1   ·   Primera División de Chile = 265
// Las temporadas son ajustables; OJO: el plan gratis suele limitar a
// temporadas 2021–2023. Si tu plan no incluye 2025/2026, cambia estas vars.
const LEAGUES = [
  {
    key: "worldcup",
    id: Number(process.env.APIFB_WC_LEAGUE || 1),
    season: Number(process.env.APIFB_WC_SEASON || 2026),
    name: "Mundial FIFA",
    short: "MUN",
    color: "#7c3aed",
  },
  {
    key: "chile",
    id: Number(process.env.APIFB_CHILE_LEAGUE || 265),
    season: Number(process.env.APIFB_CHILE_SEASON || 2025),
    name: "Primera División (Chile)",
    short: "CHI",
    color: "#dc2626",
  },
];

// Goles promedio por equipo (ancla del modelo). Ajustable por liga si se quiere.
const LEAGUE_AVG_GOALS = Number(process.env.APIFB_LEAGUE_AVG || 1.35);

// --- caché en memoria -------------------------------------------------------
const _cache = new Map(); // url -> { exp, data }

function hasKey() {
  return Boolean(KEY);
}

// Realiza un GET a API-Football. `path` ej: "/fixtures?league=265&season=2025".
// ttlMs: cuánto guardamos la respuesta en caché.
async function apiGet(path, ttlMs = 6 * 60 * 60 * 1000) {
  if (!KEY) {
    const e = new Error("FALTA_CLAVE");
    e.code = "NO_KEY";
    throw e;
  }
  const url = BASE + path;
  const hit = _cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;

  const resp = await fetch(url, { headers: { "x-apisports-key": KEY } });
  if (!resp.ok) {
    const e = new Error("HTTP " + resp.status);
    e.code = "HTTP_" + resp.status;
    throw e;
  }
  const json = await resp.json();

  // API-Football devuelve { response:[...], errors:{...}, results:N }
  if (json && json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length) {
    const e = new Error(JSON.stringify(json.errors));
    e.code = "API_ERROR";
    e.details = json.errors;
    throw e;
  }
  const data = (json && json.response) || [];
  _cache.set(url, { exp: Date.now() + ttlMs, data });
  return data;
}

module.exports = { apiGet, hasKey, LEAGUES, LEAGUE_AVG_GOALS, BASE };
