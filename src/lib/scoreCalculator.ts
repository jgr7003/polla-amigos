/**
 * Calcula los puntos ganados para una predicción del mundial
 * - 5 puntos: Marcador Exacto (Marcador exacto del partido)
 * - 3 puntos: Solo Resultado (Ganador o empate no exacto)
 * - 1 punto: Marcador Parcial (Acierta goles de un solo equipo)
 * - 0 puntos: Si no cumple ninguno de los anteriores
 */
export function calculatePoints(
  predGoals1: number,
  predGoals2: number,
  realGoals1: number,
  realGoals2: number,
  matchNum?: number
): number {
  let pts = 0;
  // 1. Marcador Exacto (5 Puntos)
  if (predGoals1 === realGoals1 && predGoals2 === realGoals2) {
    pts = 5;
  } else {
    const predDiff = predGoals1 - predGoals2;
    const realDiff = realGoals1 - realGoals2;
    
    const correctOutcome =
      (predDiff > 0 && realDiff > 0) || // Gana equipo 1
      (predDiff < 0 && realDiff < 0) || // Gana equipo 2
      (predDiff === 0 && realDiff === 0);   // Empate
    
    // 2. Solo Resultado - Ganador o Empate (3 Puntos)
    if (correctOutcome) {
      pts = 3;
    } else if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
      // 3. Marcador Parcial (1 Punto)
      pts = 1;
    }
  }
  
  // Double points for knockout stage matches (match index >= 73)
  if (matchNum && matchNum >= 73) {
    return pts * 2;
  }
  return pts;
}
