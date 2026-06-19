// ============================================================================
//  DATOS DEMO  (Asesor de Apuestas de Fútbol)
// ----------------------------------------------------------------------------
//  Esto es una base de datos de EJEMPLO para que la app funcione hoy mismo.
//  Más adelante esta capa se puede reemplazar por datos reales de una API
//  (API-Football, football-data.org, etc.) sin tocar el motor ni la interfaz.
//
//  Escala de ratings:
//    attack / defense : ~1.0 es "promedio de liga". >1.0 mejor, <1.0 peor.
//    form (jugador)    : 0 a 10  (momento futbolístico actual)
//    importance        : 0 a 10  (qué tan clave es el jugador para el equipo)
// ============================================================================

const LEAGUE = {
  // Goles promedio que marca un equipo por partido en esta liga.
  // Sirve de "ancla" para todo el modelo de Poisson.
  avgGoalsPerTeam: 1.35,
};

// Fecha de referencia "hoy" (la app la usa para detectar cumpleaños y descanso).
const TODAY = "2026-06-19";

// ----------------------------------------------------------------------------
//  EQUIPOS
// ----------------------------------------------------------------------------
const TEAMS = {
  condores: {
    id: "condores",
    name: "Cóndores FC",
    short: "CON",
    color: "#1d4ed8",
    attack: 1.28,
    defense: 1.18,        // >1 = defiende mejor que el promedio
    coach: { name: "Marcelo Ríos", birthday: "1968-06-19" }, // ¡cumple hoy!
    // Últimos 5 resultados (más reciente primero): W=ganó, D=empató, L=perdió
    lastResults: ["W", "W", "D", "W", "L"],
    restDays: 5,
    players: [
      { name: "Iván Soto",      pos: "DEL", form: 8.5, importance: 9, injured: false, birthday: "1997-06-20" },
      { name: "Lucas Pérez",    pos: "MED", form: 7.8, importance: 8, injured: false, birthday: "1995-03-11" },
      { name: "Diego Fuentes",  pos: "DEF", form: 6.5, importance: 7, injured: true,  birthday: "1994-09-02" },
      { name: "Mario Vega",     pos: "POR", form: 7.0, importance: 8, injured: false, birthday: "1992-01-30" },
      { name: "Tomás Reyes",    pos: "MED", form: 8.0, importance: 6, injured: false, birthday: "1999-11-14" },
    ],
  },

  tiburones: {
    id: "tiburones",
    name: "Tiburones Unidos",
    short: "TIB",
    color: "#0d9488",
    attack: 1.05,
    defense: 0.95,
    coach: { name: "Hernán Castro", birthday: "1971-02-04" },
    lastResults: ["L", "D", "L", "W", "D"],
    restDays: 3,
    players: [
      { name: "Pedro Ruiz",     pos: "DEL", form: 6.2, importance: 8, injured: false, birthday: "1996-07-22" },
      { name: "Andrés Lillo",   pos: "MED", form: 5.5, importance: 7, injured: false, birthday: "1993-06-19" }, // cumple hoy
      { name: "Felipe Mora",    pos: "DEF", form: 6.8, importance: 7, injured: false, birthday: "1998-05-01" },
      { name: "Cristian Díaz",  pos: "POR", form: 6.0, importance: 8, injured: false, birthday: "1990-12-09" },
      { name: "Javier Núñez",   pos: "DEL", form: 4.8, importance: 6, injured: true,  birthday: "1997-04-18" },
    ],
  },

  aguilas: {
    id: "aguilas",
    name: "Águilas Reales",
    short: "AGU",
    color: "#b45309",
    attack: 1.35,
    defense: 1.05,
    coach: { name: "Sofía Marín", birthday: "1975-10-10" },
    lastResults: ["W", "W", "W", "D", "W"],
    restDays: 6,
    players: [
      { name: "Gonzalo Aravena", pos: "DEL", form: 9.0, importance: 9, injured: false, birthday: "1998-08-08" },
      { name: "Bruno Salas",     pos: "MED", form: 8.2, importance: 8, injured: false, birthday: "1994-06-21" },
      { name: "Renato Ortiz",    pos: "DEF", form: 7.5, importance: 7, injured: false, birthday: "1991-02-15" },
      { name: "Esteban Rojas",   pos: "POR", form: 7.8, importance: 8, injured: false, birthday: "1993-03-27" },
      { name: "Nicolás Vidal",   pos: "MED", form: 7.0, importance: 6, injured: false, birthday: "2000-01-19" },
    ],
  },

  leones: {
    id: "leones",
    name: "Leones del Sur",
    short: "LEO",
    color: "#be123c",
    attack: 0.92,
    defense: 0.88,
    coach: { name: "Ramón Tapia", birthday: "1966-09-30" },
    lastResults: ["L", "L", "D", "L", "W"],
    restDays: 4,
    players: [
      { name: "Matías Bravo",   pos: "DEL", form: 5.0, importance: 7, injured: false, birthday: "1996-11-03" },
      { name: "Sergio Pinto",   pos: "MED", form: 5.8, importance: 7, injured: false, birthday: "1995-06-25" },
      { name: "Álvaro Gómez",   pos: "DEF", form: 4.5, importance: 6, injured: true,  birthday: "1992-07-07" },
      { name: "Pablo Herrera",  pos: "POR", form: 6.5, importance: 8, injured: false, birthday: "1994-04-12" },
      { name: "Camilo Silva",   pos: "MED", form: 5.2, importance: 5, injured: false, birthday: "1999-06-18" }, // cumplió ayer
    ],
  },

  halcones: {
    id: "halcones",
    name: "Halcones Negros",
    short: "HAL",
    color: "#4338ca",
    attack: 1.12,
    defense: 1.10,
    coach: { name: "Luis Carrasco", birthday: "1970-06-19" }, // cumple hoy
    lastResults: ["D", "W", "W", "D", "D"],
    restDays: 7,
    players: [
      { name: "Franco Méndez",  pos: "DEL", form: 7.2, importance: 8, injured: false, birthday: "1997-12-01" },
      { name: "Ignacio Ramos",  pos: "MED", form: 7.6, importance: 8, injured: false, birthday: "1996-02-28" },
      { name: "Vicente Lara",   pos: "DEF", form: 7.0, importance: 7, injured: false, birthday: "1993-08-19" },
      { name: "Daniel Cortés",  pos: "POR", form: 7.4, importance: 8, injured: false, birthday: "1991-05-23" },
      { name: "Joaquín Vera",   pos: "MED", form: 6.8, importance: 6, injured: false, birthday: "1998-10-04" },
    ],
  },

  pumas: {
    id: "pumas",
    name: "Pumas Andinos",
    short: "PUM",
    color: "#15803d",
    attack: 0.98,
    defense: 1.02,
    coach: { name: "Óscar Fuenzalida", birthday: "1973-03-14" },
    lastResults: ["D", "L", "W", "L", "D"],
    restDays: 2, // poco descanso = fatiga
    players: [
      { name: "Rodrigo Castro", pos: "DEL", form: 6.0, importance: 7, injured: false, birthday: "1995-09-09" },
      { name: "Manuel Soto",    pos: "MED", form: 6.4, importance: 7, injured: false, birthday: "1994-06-19" }, // cumple hoy
      { name: "Héctor Pizarro", pos: "DEF", form: 5.8, importance: 7, injured: false, birthday: "1992-11-21" },
      { name: "Gabriel Muñoz",  pos: "POR", form: 6.2, importance: 8, injured: false, birthday: "1990-07-30" },
      { name: "Benjamín Toro",  pos: "MED", form: 5.5, importance: 5, injured: true,  birthday: "1999-02-02" },
    ],
  },
};

// ----------------------------------------------------------------------------
//  PARTIDOS PRÓXIMOS  (el "fixture")
// ----------------------------------------------------------------------------
const FIXTURES = [
  { id: "m1", date: "2026-06-19", time: "20:00", home: "condores",  away: "tiburones", stadium: "Estadio Central",   importance: 6 },
  { id: "m2", date: "2026-06-20", time: "18:30", home: "aguilas",   away: "leones",    stadium: "Nido Real",         importance: 5 },
  { id: "m3", date: "2026-06-20", time: "21:00", home: "halcones",  away: "pumas",     stadium: "Coliseo Negro",     importance: 7 },
  { id: "m4", date: "2026-06-21", time: "17:00", home: "tiburones", away: "aguilas",   stadium: "Bahía Arena",       importance: 8 },
  { id: "m5", date: "2026-06-21", time: "20:00", home: "leones",    away: "halcones",  stadium: "Fortaleza del Sur", importance: 6 },
  { id: "m6", date: "2026-06-22", time: "19:00", home: "pumas",     away: "condores",  stadium: "Cumbre Andina",     importance: 9 },
];

// Exponer los datos para el resto de la app.
window.DB = { LEAGUE, TODAY, TEAMS, FIXTURES };
