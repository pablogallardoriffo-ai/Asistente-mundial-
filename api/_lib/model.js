// ============================================================================
//  Modelo Poisson (versión servidor)
// ----------------------------------------------------------------------------
//  Versión ligera del núcleo estadístico, usada para:
//    - El pronóstico RÁPIDO del listado de partidos (sin gastar muchas llamadas).
//    - El SIMULADOR / BACKTEST sobre partidos ya jugados.
//  La versión rica (con jugadores, lesiones, cumpleaños, etc.) vive en
//  js/engine.js y corre en el navegador cuando el usuario "analiza a fondo".
// ============================================================================

const MAX_GOALS = 8;

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Calcula probabilidades 1X2, marcador más probable y over/under
// a partir de los goles esperados de cada lado (lambdaH, lambdaA).
function fromLambdas(lambdaH, lambdaA) {
  lambdaH = clamp(lambdaH, 0.15, 5);
  lambdaA = clamp(lambdaA, 0.15, 5);
  let pHome = 0, pDraw = 0, pAway = 0, pOver = 0;
  const grid = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poisson(i, lambdaH) * poisson(j, lambdaA);
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j >= 3) pOver += p;
      grid.push({ i, j, p });
    }
  }
  const total = pHome + pDraw + pAway || 1;
  grid.sort((a, b) => b.p - a.p);
  return {
    lambdaH, lambdaA,
    probs: { home: pHome / total, draw: pDraw / total, away: pAway / total },
    over25: pOver / total,
    topScore: grid[0] ? `${grid[0].i}-${grid[0].j}` : "0-0",
    pick: pHome >= pDraw && pHome >= pAway ? "1" : pAway >= pDraw && pAway >= pHome ? "2" : "X",
  };
}

// Goles esperados desde fuerzas de ataque/defensa (relativas a la liga).
//   homeAttack, awayAttack : goles que suele marcar cada equipo (relativo)
//   homeDef, awayDef       : solidez defensiva (>1 = mejor defensa)
//   leagueAvg              : ancla
//   homeAdv                : ventaja de localía (multiplicador)
function predictStrength(homeAttack, homeDef, awayAttack, awayDef, leagueAvg, homeAdv = 1.12) {
  const base = leagueAvg || 1.35;
  const lambdaH = (base * homeAttack / awayDef) * homeAdv;
  const lambdaA = (base * awayAttack / homeDef) / Math.sqrt(homeAdv);
  return fromLambdas(lambdaH, lambdaA);
}

module.exports = { poisson, fromLambdas, predictStrength, clamp };
