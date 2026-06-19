# Historial de cambios

## v2.0 — Datos reales + simulador
- Integración con **API-Football** vía funciones serverless en Vercel
  (clave en `FOOTBALL_API_KEY`, nunca expuesta al navegador).
- Carga por defecto de **Mundial FIFA** y **Primera División de Chile**.
- "Analizar a fondo": busca estadísticas, plantel, jugadores (forma/cumpleaños),
  entrenador, lesiones y racha de cada equipo.
- **Simulador (backtest)**: corre el algoritmo sobre partidos ya jugados usando
  solo datos previos (sin fuga) y mide aciertos (1X2 vs baseline, marcador
  exacto, Brier, log-loss).
- Fallback a datos de ejemplo cuando no hay clave configurada.

## v1.0 — MVP
- Motor de predicción Poisson con variables de contexto.
- Panel de partidos con pronóstico, probabilidades y argumentos (datos demo).
