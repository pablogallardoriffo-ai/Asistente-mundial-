// ============================================================================
//  GET /api/debug?q=<ruta de TheSportsDB>   (TEMPORAL - diagnóstico)
//  Permite inspeccionar qué devuelve la fuente pública desde el lado servidor.
//  Ej: /api/debug?q=/search_all_leagues.php?c=Chile%26s=Soccer
//  Se elimina una vez afinada la configuración de ligas.
// ============================================================================

const { tsdb } = require("./_lib/sportsdb");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const q = (req.query && req.query.q) || "/all_leagues.php";
  try {
    const data = await tsdb(q, 60 * 1000);
    // Si es all_leagues, filtramos a fútbol y resumimos para no saturar.
    if (data && data.leagues && Array.isArray(data.leagues)) {
      const find = ((req.query && req.query.find) || "").toLowerCase();
      let soccer = data.leagues
        .filter((l) => (l.strSport || "") === "Soccer")
        .map((l) => ({ id: l.idLeague, name: l.strLeague, country: l.strCountry, season: l.strCurrentSeason }));
      if (find) soccer = soccer.filter((l) => (l.name || "").toLowerCase().includes(find) || (l.country || "").toLowerCase().includes(find));
      return res.status(200).json({ count: soccer.length, soccer });
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ error: String(e.message || e), code: e.code });
  }
};
