/**
 * Calcula los puntos ganados para una predicción del mundial
 * - 3 puntos si acierta el marcador exacto
 * - 1 punto si acierta el ganador o el empate (sin marcador exacto)
 * - 0 puntos si no acierta el resultado
 */
export function calculatePoints(
  predGoals1: number,
  predGoals2: number,
  realGoals1: number,
  realGoals2: number
): number {
  // 1. Marcador Exacto (5 Puntos)
  if (predGoals1 === realGoals1 && predGoals2 === realGoals2) {
    return 5;
  }
  
  const predDiff = predGoals1 - predGoals2;
  const realDiff = realGoals1 - realGoals2;
  
  const correctOutcome =
    (predDiff > 0 && realDiff > 0) || // Gana equipo 1
    (predDiff < 0 && realDiff < 0) || // Gana equipo 2
    (predDiff === 0 && realDiff === 0);   // Empate
  
  // 2. Resultado Exacto con Diferencia de Goles (3 Puntos)
  if (correctOutcome && predDiff === realDiff) {
    return 3;
  }
  
  // 3. Acierto de Resultado (2 Puntos)
  if (correctOutcome) {
    return 2;
  }
  
  // 4. Marcador Parcial (1 Punto)
  if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
    return 1;
  }
  
  return 0;
}
