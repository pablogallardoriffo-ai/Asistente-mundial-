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

## 🔌 Cómo conectar datos REALES (siguiente paso)

Hoy usa datos de ejemplo en `js/data.js`. Para usar datos reales solo hay que
reemplazar esa capa por una API de fútbol, manteniendo la misma forma de datos:

- [API-Football](https://www.api-football.com/) (planilla, lesiones, forma…)
- [football-data.org](https://www.football-data.org/) (resultados, fixtures)

El **motor** (`engine.js`) y la **interfaz** (`app.js`) no cambian: solo cambia
de dónde vienen los `TEAMS` y `FIXTURES`.

### Ideas para ampliar
- Historial cara a cara (head-to-head) entre los dos equipos.
- Clima y estado de la cancha.
- Cuotas reales para detectar apuestas de "valor" automáticamente.
- Formulario para cargar datos a mano cuando no haya API.
- Guardar pronósticos y comparar contra el resultado real (medir aciertos).
```
