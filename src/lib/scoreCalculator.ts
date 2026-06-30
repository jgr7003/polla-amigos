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
  group?: string | null
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
  
  // Double points for knockout stage matches: once the group stage is over,
  // matches no longer belong to a group (group is null/empty).
  if (group == null || group === "") {
    return pts * 2;
  }
  return pts;
}

/** Datos mínimos de un partido para el cálculo acumulado. */
export interface CumulativeMatch {
  id: string;
  /** Índice cronológico del partido (kickoff). Menor = antes. */
  order: number;
  group: string | null;
  result: { goals1: number; goals2: number; isFinal?: boolean } | null;
}

/** Datos mínimos de una predicción para el cálculo acumulado. */
export interface CumulativePrediction {
  id: string;
  userId: string;
  matchId: string;
  goals1: number;
  goals2: number;
}

/** Desglose de puntos acumulados para una predicción. */
export interface CumulativeEntry {
  /** Puntos ganados en este partido (estimado si está en vivo). */
  points: number;
  /** Acumulado del usuario ANTES de este partido (solo partidos finalizados). */
  prevPoints: number;
  /**
   * Acumulado del usuario DESPUÉS de este partido = prevPoints + points.
   * `null` mientras el partido no haya finalizado (en vivo o sin jugar).
   */
  afterMatchPoints: number | null;
}

export interface CumulativeResult {
  /** predictionId -> desglose. */
  byPrediction: Map<string, CumulativeEntry>;
  /** userId -> total final (= afterMatchPoints del último partido finalizado). */
  userTotals: Map<string, number>;
}

/**
 * Recorre las predicciones de cada usuario en orden cronológico y calcula el
 * acumulado corrido (prevPoints / afterMatchPoints) por predicción, además del
 * total final por usuario.
 *
 * Solo los partidos finalizados (`result.isFinal !== false`) avanzan el
 * acumulado; los partidos en vivo o sin jugar dejan `afterMatchPoints` en `null`
 * y no contaminan el `prevPoints` de los partidos siguientes.
 */
export function computeCumulativePoints(
  predictions: CumulativePrediction[],
  matches: CumulativeMatch[]
): CumulativeResult {
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const byUser = new Map<string, CumulativePrediction[]>();
  for (const p of predictions) {
    const arr = byUser.get(p.userId);
    if (arr) arr.push(p);
    else byUser.set(p.userId, [p]);
  }

  const byPrediction = new Map<string, CumulativeEntry>();
  const userTotals = new Map<string, number>();

  for (const [userId, userPreds] of byUser) {
    const sorted = userPreds.slice().sort((a, b) => {
      const oa = matchById.get(a.matchId)?.order ?? Number.MAX_SAFE_INTEGER;
      const ob = matchById.get(b.matchId)?.order ?? Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    let running = 0;
    for (const p of sorted) {
      const m = matchById.get(p.matchId);
      let points = 0;
      let isFinal = false;
      if (m && m.result) {
        isFinal = m.result.isFinal !== false;
        points = calculatePoints(p.goals1, p.goals2, m.result.goals1, m.result.goals2, m.group);
      }

      const prevPoints = running;
      let afterMatchPoints: number | null = null;
      if (isFinal) {
        afterMatchPoints = running + points;
        running = afterMatchPoints;
      }

      byPrediction.set(p.id, { points, prevPoints, afterMatchPoints });
    }

    userTotals.set(userId, running);
  }

  return { byPrediction, userTotals };
}
