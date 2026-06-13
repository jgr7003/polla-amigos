/**
 * Calcula los puntos ganados para una predicción del mundial
 * - 5 puntos: Marcador Exacto (Marcador exacto del partido)
 * - 3 puntos: Resultado y Diferencia (Solo para ganador, si coincide la diferencia)
 * - 2 puntos: Solo Resultado (Ganador o empate no exacto)
 * - 1 punto: Marcador Parcial (Acierta goles de un solo equipo)
 * - 0 puntos: Si no cumple ninguno de los anteriores
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
  
  // 2. Resultado y Diferencia - Solo para Ganador (3 Puntos)
  // (Aplica si hay ganador y la diferencia coincide. Se excluye el empate de esta regla)
  if (correctOutcome && predDiff !== 0 && predDiff === realDiff) {
    return 3;
  }
  
  // 3. Solo Resultado - Ganador o Empate (2 Puntos)
  if (correctOutcome) {
    return 2;
  }
  
  // 4. Marcador Parcial (1 Punto)
  if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
    return 1;
  }
  
  return 0;
}
