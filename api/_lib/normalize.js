// ============================================================================
//  Normalizador: respuestas de API-Football  ->  formato de NUESTRO motor
// ----------------------------------------------------------------------------
//  El motor (js/engine.js) espera equipos con esta forma:
//    { id, name, short, color, attack, defense,
//      coach:{name,birthday}, lastResults:["W"|"D"|"L"...],
//      restDays, players:[{name,pos,form,importance,injured,birthday}] }
//  Aquí construimos exactamente eso a partir de los endpoints de la API.
// ============================================================================

function short(name = "") {
  return name.replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, "").trim().slice(0, 3).toUpperCase() || "EQ";
}

// "2024-06-19T20:00:00+00:00" -> { date:"2024-06-19", time:"20:00" }
function splitDate(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d)) return { date: String(iso).slice(0, 10), time: "" };
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return { date, time };
}

// --- FIXTURES ---------------------------------------------------------------
// Convierte un item de /fixtures en un partido simple para el panel.
function normalizeFixture(item, league) {
  const f = item.fixture || {};
  const t = item.teams || {};
  const g = item.goals || {};
  const { date, time } = splitDate(f.date);
  return {
    id: String(f.id),
    leagueKey: league.key,
    leagueName: league.name,
    leagueColor: league.color,
    date,
    time,
    timestamp: f.timestamp || 0,
    status: (f.status && f.status.short) || "NS", // NS=no empezado, FT=final
    finished: (f.status && f.status.short) === "FT",
    stadium: (f.venue && f.venue.name) || "",
    home: { id: t.home && t.home.id, name: (t.home && t.home.name) || "Local", short: short(t.home && t.home.name) },
    away: { id: t.away && t.away.id, name: (t.away && t.away.name) || "Visita", short: short(t.away && t.away.name) },
    goals: { home: g.home, away: g.away },
    importance: 6, // base; el Mundial/eliminatorias suben esto en match.js
  };
}

// --- racha desde un string de forma "WWDLW" ---------------------------------
function formStringToResults(formStr) {
  if (!formStr) return [];
  // API entrega la forma del más antiguo al más reciente; la invertimos.
  return formStr.split("").reverse().slice(0, 10);
}

// --- EQUIPO PROFUNDO --------------------------------------------------------
// Recibe las respuestas crudas de varios endpoints y arma el objeto de equipo.
//   stats   : /teams/statistics  (un objeto)
//   players : /players?team&season&page=1  (array)
//   injuries: /injuries?team&season  (array)
//   coach   : /coachs?team  (array)
function normalizeTeamDeep({ teamMeta, stats, players, injuries, coach, color, leagueAvg }) {
  leagueAvg = leagueAvg || 1.35;

  // Ataque / defensa a partir de promedios de goles de la temporada.
  const gf = num(stats && stats.goals && stats.goals.for && stats.goals.for.average && stats.goals.for.average.total);
  const ga = num(stats && stats.goals && stats.goals.against && stats.goals.against.average && stats.goals.against.average.total);
  const attack = gf ? clamp(gf / leagueAvg, 0.4, 2.2) : 1.0;
  // defensa: conceder MENOS que el promedio => defense > 1 (mejor defensa)
  const defense = ga ? clamp(leagueAvg / ga, 0.4, 2.2) : 1.0;

  // Racha (últimos resultados) desde stats.form.
  const lastResults = formStringToResults(stats && stats.form);

  // Set de nombres lesionados (para marcar el plantel).
  const injuredNames = new Set(
    (injuries || [])
      .map((i) => i.player && i.player.name)
      .filter(Boolean)
      .map((n) => n.toLowerCase())
  );

  // Jugadores: nombre, posición, cumpleaños, forma (rating) e importancia.
  const playerList = (players || [])
    .map((p) => {
      const info = p.player || {};
      const st = (p.statistics && p.statistics[0]) || {};
      const ratingRaw = num(st.games && st.games.rating);
      // El rating de la API ronda ~6.8 de media; lo recentramos a nuestra
      // escala donde 5.0 = neutro.
      const form = ratingRaw ? clamp(5 + (ratingRaw - 6.8) * 1.2, 0, 10) : 5;
      const apps = num(st.games && st.games.appearences) || 0;
      const importance = clamp(3 + apps * 0.25, 3, 10);
      return {
        name: info.name || "Jugador",
        pos: posShort((st.games && st.games.position) || (info.position) || ""),
        form: round1(form),
        importance: round1(importance),
        injured: info.name ? injuredNames.has(info.name.toLowerCase()) : false,
        birthday: (info.birth && info.birth.date) || null,
      };
    })
    .slice(0, 20);

  // Si la API no trajo plantel pero sí lesionados, al menos reflejamos las bajas.
  (injuries || []).forEach((i) => {
    const nm = i.player && i.player.name;
    if (nm && !playerList.some((p) => p.name.toLowerCase() === nm.toLowerCase())) {
      playerList.push({ name: nm, pos: "—", form: 5, importance: 6, injured: true, birthday: null });
    }
  });

  // Entrenador (nombre + cumpleaños).
  const c = (coach && coach[0]) || {};
  const coachObj = { name: c.name || "Cuerpo técnico", birthday: c.birthdate || null };

  return {
    id: String(teamMeta && teamMeta.id),
    name: (teamMeta && teamMeta.name) || "Equipo",
    short: short(teamMeta && teamMeta.name),
    color: color || "#2563eb",
    attack,
    defense,
    coach: coachObj,
    lastResults,
    restDays: 4, // neutro: la API no lo entrega directo
    players: playerList,
  };
}

// --- utilidades -------------------------------------------------------------
function num(x) {
  const n = parseFloat(x);
  return isFinite(n) ? n : 0;
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function posShort(pos = "") {
  const p = pos.toLowerCase();
  if (p.startsWith("goal")) return "POR";
  if (p.startsWith("def")) return "DEF";
  if (p.startsWith("mid")) return "MED";
  if (p.startsWith("att") || p.startsWith("for")) return "DEL";
  return pos ? pos.slice(0, 3).toUpperCase() : "—";
}

// ============================================================================
//  Normalización para TheSportsDB (fuente pública sin clave)
// ============================================================================

// Un "event" de TheSportsDB -> nuestro formato de partido.
function tsdbEvent(ev, league) {
  const date = ev.dateEvent || (ev.strTimestamp || "").slice(0, 10);
  const time = (ev.strTime || "").slice(0, 5);
  let ts = 0;
  if (ev.strTimestamp) ts = Math.floor(Date.parse(ev.strTimestamp) / 1000) || 0;
  else if (date) ts = Math.floor(Date.parse(`${date}T${time || "00:00"}:00Z`) / 1000) || 0;

  const hs = ev.intHomeScore, as = ev.intAwayScore;
  const finished = hs != null && hs !== "" && as != null && as !== "";
  return {
    id: String(ev.idEvent),
    leagueKey: league.key,
    leagueName: league.name,
    leagueColor: league.color,
    date,
    time,
    timestamp: ts,
    status: ev.strStatus || "",
    finished,
    stadium: ev.strVenue || "",
    home: { id: ev.idHomeTeam, name: ev.strHomeTeam || "Local", short: short(ev.strHomeTeam) },
    away: { id: ev.idAwayTeam, name: ev.strAwayTeam || "Visita", short: short(ev.strAwayTeam) },
    goals: { home: finished ? Number(hs) : null, away: finished ? Number(as) : null },
    importance: league.key === "worldcup" ? 8 : 6,
  };
}

// A partir de los últimos partidos de UN equipo -> racha + fuerzas.
//   events: lista de eventos (idHomeTeam/idAwayTeam + marcadores)
//   teamId: id del equipo
function teamFromEvents(events, teamId, leagueAvg) {
  leagueAvg = leagueAvg || 1.35;
  const results = [];
  let gf = 0, ga = 0, n = 0;
  (events || []).forEach((ev) => {
    const hs = ev.intHomeScore, as = ev.intAwayScore;
    if (hs == null || hs === "" || as == null || as === "") return;
    const isHome = String(ev.idHomeTeam) === String(teamId);
    const isAway = String(ev.idAwayTeam) === String(teamId);
    if (!isHome && !isAway) return;
    const my = isHome ? Number(hs) : Number(as);
    const opp = isHome ? Number(as) : Number(hs);
    gf += my; ga += opp; n += 1;
    results.push(my > opp ? "W" : my < opp ? "L" : "D");
  });
  const avgFor = n ? gf / n : leagueAvg;
  const avgAgainst = n ? ga / n : leagueAvg;
  return {
    lastResults: results.slice(0, 10),
    attack: clampN(avgFor / leagueAvg, 0.4, 2.2),
    defense: clampN(leagueAvg / Math.max(0.3, avgAgainst), 0.4, 2.2),
    played: n,
  };
}

// Plantel de TheSportsDB (lookup_all_players) -> jugadores del motor.
function tsdbPlayers(arr) {
  return (arr || [])
    .filter((p) => p && p.strPlayer)
    .map((p) => ({
      name: p.strPlayer,
      pos: posShort(p.strPosition || ""),
      form: 5, // la fuente gratis no da rating individual -> neutro
      importance: 6,
      injured: false, // sin datos de lesiones en esta fuente
      birthday: p.dateBorn && p.dateBorn !== "0000-00-00" ? p.dateBorn : null,
    }))
    .slice(0, 25);
}

function clampN(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

module.exports = {
  normalizeFixture,
  normalizeTeamDeep,
  formStringToResults,
  splitDate,
  short,
  tsdbEvent,
  teamFromEvents,
  tsdbPlayers,
};
