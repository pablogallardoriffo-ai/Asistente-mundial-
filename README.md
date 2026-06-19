# ⚽ Asesor de Apuestas de Fútbol

Aplicación web que analiza partidos cruzando **muchas variables** (momento de
los jugadores, lesiones, racha, localía, descanso, cumpleaños de jugadores y
del entrenador, importancia del partido…) y entrega, con un **modelo
estadístico**, la probabilidad de cada resultado junto con los **argumentos**
del porqué.

> ⚠️ Predecir el futuro es imposible. Esto es un **acercamiento probabilístico**
> bien fundamentado, no una certeza. Herramienta informativa/educativa.
> Apuesta con responsabilidad.

---

## 🚀 Cómo verlo

No necesita instalar nada. Tienes dos opciones:

**Opción A — abrir el archivo:** abre `index.html` en tu navegador.

**Opción B — servidor local (recomendado):**
```bash
# con Python
python3 -m http.server 8000
# luego abre  http://localhost:8000
```

---

## 🧠 Cómo funciona el modelo

El cálculo vive en `js/engine.js` y sigue estos pasos:

1. **Fuerza base** de cada equipo (ataque / defensa).
2. Se aplican **factores de contexto** (cada uno suma o resta):
   - Momento futbolístico del plantel (forma ponderada por importancia)
   - Lesionados / bajas clave
   - Racha de los últimos 5 partidos
   - Días de descanso (fatiga)
   - Cumpleaños de jugadores y del entrenador
   - Localía
   - Importancia del partido
3. Con eso se calculan los **goles esperados** (xG) de cada equipo.
4. Se aplica la **distribución de Poisson** (el estándar para marcadores de
   fútbol) para obtener la probabilidad de **cada marcador posible**.
5. Sumando marcadores se obtiene: **% gana local / empate / gana visita**, el
   **marcador más probable**, y **Over/Under 2.5 goles**.
6. Se generan los **argumentos** en lenguaje natural mostrando los factores que
   más pesaron.

También calcula la **cuota justa** (1 / probabilidad), útil para comparar contra
las cuotas reales de una casa de apuestas y detectar "valor".

---

## 📁 Estructura

```
index.html        Página y panel de partidos
styles.css        Diseño
js/data.js        Datos DEMO (equipos, jugadores, fixture)  ← reemplazable
js/engine.js      Motor de predicción (Poisson + factores)
js/app.js         Dibuja las tarjetas y los argumentos
```

---

## 🔌 Datos reales SIN registro (TheSportsDB) — opción por defecto

La app va a buscar los datos ella misma a una base de datos pública y abierta,
[**TheSportsDB**](https://www.thesportsdb.com/), usando su **clave de prueba
pública** (no necesitas registrarte ni configurar nada). Las llamadas se hacen
desde **funciones serverless** en Vercel (carpeta `api/`).

**Cobertura de la fuente gratuita (honestidad):**
- ✅ Partidos, resultados y **racha** de cada equipo → disponibles.
- ⚠️ **Plantel de jugadores** (con cumpleaños) → según disponibilidad de la liga.
- ❌ **Lesiones** y **cumpleaños del entrenador** → normalmente no incluidos.

Variables opcionales (solo si quieres afinar) en Vercel → Environment Variables:

| Variable | Para qué |
|---|---|
| `TSDB_CHILE_SEASON` | temporada liga chilena (ej. `2024-2025`) |
| `TSDB_WC_SEASON` | temporada del Mundial (ej. `2022`) |
| `TSDB_CHILE_LEAGUE` / `TSDB_WC_LEAGUE` | fijar el id de liga si el automático falla |
| `TSDB_KEY` | usar tu propia clave de TheSportsDB (Patreon) para más datos |

### (Alternativa) Datos premium con API-Football

Si más adelante quieres datos más completos (lesiones, rating por jugador,
cumpleaños del DT), el proyecto incluye también un cliente para
[API-Football](https://www.api-football.com/) en `api/_lib/apiFootball.js`.
Requiere registrarse y poner `FOOTBALL_API_KEY`. No es necesario para usar la app.

### Paso 1 — Conseguir la clave (gratis)
1. Crea una cuenta en https://dashboard.api-football.com/ (o vía RapidAPI).
2. Copia tu **API key** (el plan gratis da 100 consultas/día).

### Paso 2 — Configurarla en Vercel
En tu proyecto de Vercel → **Settings → Environment Variables**, agrega:

| Variable | Valor | Obligatoria |
|---|---|---|
| `FOOTBALL_API_KEY` | tu clave de API-Football | ✅ Sí |
| `APIFB_WC_SEASON` | temporada del Mundial (ej. `2026`) | opcional |
| `APIFB_CHILE_SEASON` | temporada liga chilena (ej. `2025`) | opcional |
| `APIFB_WC_LEAGUE` | id liga Mundial (por defecto `1`) | opcional |
| `APIFB_CHILE_LEAGUE` | id liga Chile (por defecto `265`) | opcional |

> ⚠️ **Plan gratis:** suele limitar las temporadas a **2021–2023**. Si tu plan no
> incluye 2025/2026, pon `APIFB_CHILE_SEASON=2023` y `APIFB_WC_SEASON=2022` para
> ver datos reales y probar el simulador. Con plan de pago puedes usar la actual.

Luego **vuelve a desplegar** (o haz un push) y listo: el badge arriba pasará de
🟡 *datos de ejemplo* a 🟢 *datos reales*.

### Cómo se reparten las llamadas (para cuidar el plan gratis)
- `GET /api/fixtures` → 1 llamada por liga (cacheada 6h). Lista partidos + pronóstico rápido.
- `GET /api/match` → ~4 llamadas por equipo, **solo al pulsar "Analizar a fondo"** (cacheada 24h).
- `GET /api/backtest` → 1 llamada por liga/temporada (cacheada 12h). Simulador.

## 🧪 Simulador (backtest)

Pestaña *Simulador*: corre el modelo sobre los partidos **ya jugados** de una
temporada, prediciendo cada uno con **solo la información previa** (sin fuga de
información), y compara con el resultado real. Muestra:
- **Acierto 1X2** vs un baseline (siempre local).
- **Marcador exacto**.
- **Brier score** y **Log-loss** (miden si las probabilidades están bien calibradas).

## 🗂️ Estructura del backend

```
api/
  _lib/apiFootball.js   Cliente + caché + config de ligas (clave en secreto)
  _lib/normalize.js     Traduce API-Football -> formato del motor
  _lib/model.js         Poisson (servidor) para pronóstico rápido y backtest
  fixtures.js           GET /api/fixtures  (listado + pronóstico rápido)
  match.js              GET /api/match     (análisis a fondo de un partido)
  backtest.js           GET /api/backtest  (simulador / comprobación)
```

### Ideas para ampliar
- Historial cara a cara (head-to-head) entre los dos equipos.
- Clima y estado de la cancha.
- Cuotas reales de casas de apuestas para detectar "valor" automáticamente.
- Guardar pronósticos y comparar contra el resultado real con el tiempo.
```
