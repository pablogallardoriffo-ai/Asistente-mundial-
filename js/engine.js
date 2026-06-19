// ============================================================================
//  MOTOR DE PREDICCIÓN  (Asesor de Apuestas de Fútbol)
// ----------------------------------------------------------------------------
//  Idea general:
//    1) Cada equipo tiene una fuerza base de ataque y defensa.
//    2) A esa base le sumamos/restamos FACTORES contextuales (forma, lesiones,
//       cumpleaños, descanso, racha, localía, importancia del partido...).
//    3) Con eso obtenemos los "goles esperados" (lambda) de cada equipo.
//    4) Aplicamos la distribución de POISSON -> probabilidad de cada marcador.
//    5) Sumando marcadores obtenemos: % gana local / empate / gana visita,
//       el marcador más probable y el "over/under" 2.5 goles.
//    6) Guardamos cada factor con su explicación para mostrar los ARGUMENTOS.
//
//  IMPORTANTE: esto es un MODELO. El fútbol es caótico; entrega un acercamiento
//  probabilístico bien fundamentado, no una certeza.
// ============================================================================

(function () {
  const MAX_GOALS = 8; // tope de la grilla de marcadores (0..8 por equipo)

  // ---- utilidades matemáticas ----------------------------------------------
  function factorial(n) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  // Probabilidad de marcar exactamente k goles si esperas lambda (Poisson).
  function poisson(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  // ¿Cumple años "alrededor" de la fecha del partido? (mismo mes y día)
  function isBirthday(birthday, matchDateISO) {
    if (!birthday) return false;
    const b = birthday.slice(5); // MM-DD
    const m = matchDateISO.slice(5);
    return b === m;
  }

  // ---- cálculo de fuerza de equipo con factores -----------------------------
  // Devuelve { attackMult, defenseMult, notes:[{label, effect, detail}] }
  //   attackMult  : multiplicador sobre el ataque base
  //   defenseMult : multiplicador sobre la solidez defensiva base
  //   notes       : lista de factores con su efecto (para los argumentos)
  function teamContext(team, matchDateISO, matchImportance, isHome) {
    const notes = [];
    let attackMult = 1.0;
    let defenseMult = 1.0;

    // --- 1) Forma de los jugadores (promedio ponderado por importancia) ----
    const fit = team.players.filter((p) => !p.injured);
    let wSum = 0,
      fSum = 0;
    fit.forEach((p) => {
      wSum += p.importance;
      fSum += p.form * p.importance;
    });
    const avgForm = wSum ? fSum / wSum : 5;
    // 5.0 es neutro. Cada punto por encima/debajo mueve ~6% el ataque.
    const formAtk = 1 + (avgForm - 5) * 0.06;
    const formDef = 1 + (avgForm - 5) * 0.04;
    attackMult *= formAtk;
    defenseMult *= formDef;
    notes.push({
      label: "Momento futbolístico del plantel",
      effect: avgForm - 5,
      detail: `Forma media ponderada de ${avgForm.toFixed(1)}/10. ` +
        (avgForm >= 5.5 ? "Plantel en buen momento." :
         avgForm <= 4.5 ? "Plantel en bajón." : "Plantel en nivel normal."),
    });

    // --- 2) Lesionados / bajas importantes ---------------------------------
    const injured = team.players.filter((p) => p.injured);
    if (injured.length) {
      let penalty = 0;
      injured.forEach((p) => (penalty += p.importance));
      // Cada punto de importancia perdida resta ~2% al ataque y ~1.5% a la defensa.
      attackMult *= 1 - penalty * 0.02;
      defenseMult *= 1 - penalty * 0.015;
      notes.push({
        label: "Bajas / lesionados",
        effect: -penalty,
        detail: `Ausencias: ${injured.map((p) => `${p.name} (${p.pos})`).join(", ")}. ` +
          "Pierde rendimiento ofensivo y defensivo.",
      });
    }

    // --- 3) Racha de resultados (últimos 5) --------------------------------
    const pts = { W: 3, D: 1, L: 0 };
    let streak = 0;
    (team.lastResults || []).forEach((r, i) => {
      // los más recientes pesan más
      const w = 1 - i * 0.12;
      streak += (pts[r] - 1) * w; // -1 centra el empate en 0
    });
    const streakAtk = 1 + clamp(streak, -4, 4) * 0.025;
    attackMult *= streakAtk;
    notes.push({
      label: "Racha reciente",
      effect: streak,
      detail: `Últimos 5: ${(team.lastResults || []).join("-")}. ` +
        (streak > 1 ? "Viene enchufado." : streak < -1 ? "Viene en mala racha." : "Racha irregular."),
    });

    // --- 4) Descanso / fatiga ----------------------------------------------
    const rest = team.restDays ?? 4;
    if (rest <= 2) {
      attackMult *= 0.95;
      defenseMult *= 0.95;
      notes.push({ label: "Pocos días de descanso", effect: -1,
        detail: `Solo ${rest} días desde el último partido: posible fatiga.` });
    } else if (rest >= 6) {
      attackMult *= 1.03;
      defenseMult *= 1.02;
      notes.push({ label: "Bien descansado", effect: 1,
        detail: `${rest} días de descanso: plantel fresco.` });
    }

    // --- 5) Cumpleaños (jugadores y entrenador) ----------------------------
    const bdayPlayers = team.players.filter(
      (p) => !p.injured && isBirthday(p.birthday, matchDateISO)
    );
    if (bdayPlayers.length) {
      attackMult *= 1 + 0.015 * bdayPlayers.length;
      notes.push({ label: "Jugador(es) de cumpleaños", effect: 1,
        detail: `${bdayPlayers.map((p) => p.name).join(", ")} cumple(n) años: pequeño plus de motivación.` });
    }
    if (team.coach && isBirthday(team.coach.birthday, matchDateISO)) {
      attackMult *= 1.01;
      defenseMult *= 1.01;
      notes.push({ label: "Cumpleaños del entrenador", effect: 1,
        detail: `${team.coach.name} (DT) está de cumpleaños: dato anecdótico, leve plus anímico.` });
    }

    // --- 6) Localía ---------------------------------------------------------
    if (isHome) {
      attackMult *= 1.12;
      defenseMult *= 1.05;
      notes.push({ label: "Localía", effect: 2,
        detail: "Juega de local: empuje del público y cancha conocida." });
    }

    // --- 7) Importancia del partido ----------------------------------------
    if (matchImportance >= 8) {
      defenseMult *= 1.04; // partidos claves suelen ser más cerrados
      notes.push({ label: "Partido de alta importancia", effect: 0,
        detail: "Mucho en juego: suele jugarse más cerrado y con cautela." });
    }

    return { attackMult, defenseMult, notes };
  }

  // ---- predicción de un partido completo ------------------------------------
  function predictMatch(fixture, DB) {
    const home = DB.TEAMS[fixture.home];
    const away = DB.TEAMS[fixture.away];
    const base = DB.LEAGUE.avgGoalsPerTeam;

    const ctxH = teamContext(home, fixture.date, fixture.importance, true);
    const ctxA = teamContext(away, fixture.date, fixture.importance, false);

    // Goles esperados = base * ataque propio * (debilidad defensiva rival)
    // Una defensa rival "fuerte" (defense>1) reduce mis goles -> dividimos.
    let lambdaH =
      base * (home.attack * ctxH.attackMult) / (away.defense * ctxA.defenseMult);
    let lambdaA =
      base * (away.attack * ctxA.attackMult) / (home.defense * ctxH.defenseMult);

    lambdaH = clamp(lambdaH, 0.2, 5);
    lambdaA = clamp(lambdaA, 0.2, 5);

    // Grilla de Poisson: prob de cada marcador (i goles local, j goles visita)
    let pHome = 0,
      pDraw = 0,
      pAway = 0,
      pOver25 = 0;
    const scorelines = [];
    for (let i = 0; i <= MAX_GOALS; i++) {
      for (let j = 0; j <= MAX_GOALS; j++) {
        const p = poisson(i, lambdaH) * poisson(j, lambdaA);
        if (i > j) pHome += p;
        else if (i === j) pDraw += p;
        else pAway += p;
        if (i + j >= 3) pOver25 += p;
        scorelines.push({ i, j, p });
      }
    }

    // Normalizar (la grilla está truncada en 8 goles).
    const total = pHome + pDraw + pAway || 1;
    pHome /= total;
    pDraw /= total;
    pAway /= total;

    scorelines.sort((a, b) => b.p - a.p);
    const topScores = scorelines.slice(0, 4).map((s) => ({
      label: `${s.i}-${s.j}`,
      prob: s.p / total,
    }));

    // Cuotas "justas" (sin margen de casa) = 1 / probabilidad. Útil para comparar.
    const fairOdds = (p) => (p > 0 ? (1 / p).toFixed(2) : "—");

    return {
      fixture,
      home,
      away,
      lambdaH,
      lambdaA,
      probs: { home: pHome, draw: pDraw, away: pAway },
      over25: pOver25 / total,
      under25: 1 - pOver25 / total,
      topScores,
      fairOdds: {
        home: fairOdds(pHome),
        draw: fairOdds(pDraw),
        away: fairOdds(pAway),
      },
      factors: { home: ctxH.notes, away: ctxA.notes },
      arguments: buildArguments(home, away, ctxH, ctxA, { pHome, pDraw, pAway, lambdaH, lambdaA }),
    };
  }

  // ---- generación de los ARGUMENTOS en lenguaje natural ---------------------
  function buildArguments(home, away, ctxH, ctxA, r) {
    const out = [];
    const fav =
      r.pHome > r.pAway && r.pHome > r.pDraw
        ? home.name
        : r.pAway > r.pHome && r.pAway > r.pDraw
        ? away.name
        : "ninguno claro (parejo)";

    out.push(
      `El modelo ve como escenario más probable a **${fav}**. ` +
        `Goles esperados: ${home.short} ${r.lambdaH.toFixed(2)} — ${away.short} ${r.lambdaA.toFixed(2)}.`
    );

    // Toma los 2 factores más influyentes de cada lado.
    const top = (notes) =>
      [...notes].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 2);

    top(ctxH.notes).forEach((n) =>
      out.push(`${home.short}: ${n.label} — ${n.detail}`)
    );
    top(ctxA.notes).forEach((n) =>
      out.push(`${away.short}: ${n.label} — ${n.detail}`)
    );

    return out;
  }

  // Exponer el motor.
  window.ENGINE = { predictMatch, poisson };
})();
