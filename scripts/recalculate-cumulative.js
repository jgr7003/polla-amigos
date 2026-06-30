/**
 * Recalcula y persiste, directamente contra el emulador de Firestore, el
 * desglose acumulado de puntos por predicción (points / prevPoints /
 * afterMatchPoints) y el total de cada usuario.
 *
 * Replica la lógica de src/lib/scoreCalculator.ts (calculatePoints +
 * computeCumulativePoints) y el orden cronológico de src/app/page.tsx
 * (getMatchStartDate). Es el mismo cálculo que el botón "Recalcular todos los
 * puntajes" del panel admin, pero corrible desde la terminal para arreglar
 * datos viejos.
 *
 * Uso:
 *   node scripts/recalculate-cumulative.js            (solo muestra el plan)
 *   node scripts/recalculate-cumulative.js --apply    (escribe los cambios)
 *
 * Variables de entorno opcionales:
 *   FIRESTORE_EMULATOR_HOST   (default 127.0.0.1:8082)
 *   FIREBASE_PROJECT_ID       (default polla-amigos-2026-sb)
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8082";
const PROJECT = process.env.FIREBASE_PROJECT_ID || "polla-amigos-2026-sb";
const APPLY = process.argv.includes("--apply");
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };

// --- Lógica de puntaje (idéntica a src/lib/scoreCalculator.ts) -------------

function calculatePoints(p1, p2, r1, r2, group) {
  let pts = 0;
  if (p1 === r1 && p2 === r2) {
    pts = 5;
  } else {
    const pd = p1 - p2;
    const rd = r1 - r2;
    const correct = (pd > 0 && rd > 0) || (pd < 0 && rd < 0) || (pd === 0 && rd === 0);
    if (correct) pts = 3;
    else if (p1 === r1 || p2 === r2) pts = 1;
  }
  // x2 en fase de eliminación: el partido ya no pertenece a un grupo.
  if (group == null || group === "") return pts * 2;
  return pts;
}

// --- Orden cronológico (idéntico a getMatchStartDate de page.tsx) -----------

function getMatchStartDate(match) {
  try {
    const timeClean = (match.time || "").replace("UTC", "").trim();
    const parts = timeClean.split(" ");
    const timePart = parts[0];
    const offsetPart = parts[1] || "-5";
    let offsetFormatted = "";
    if (offsetPart.startsWith("-") || offsetPart.startsWith("+")) {
      const sign = offsetPart.substring(0, 1);
      const valNum = Number(offsetPart.substring(1));
      offsetFormatted = `${sign}${String(valNum).padStart(2, "0")}:00`;
    } else {
      const valNum = Number(offsetPart);
      if (!isNaN(valNum)) {
        const sign = valNum >= 0 ? "+" : "-";
        offsetFormatted = `${sign}${String(Math.abs(valNum)).padStart(2, "0")}:00`;
      } else {
        offsetFormatted = "-05:00";
      }
    }
    const date = new Date(`${match.date}T${timePart}:00${offsetFormatted}`);
    if (!isNaN(date.getTime())) return date;
  } catch (e) {
    /* fallthrough */
  }
  return new Date(match.date);
}

// --- Helpers REST -----------------------------------------------------------

async function fetchCollection(name) {
  const out = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET ${name}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const d of data.documents || []) out.push(d);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return out;
}

const f = (fields, key) => fields && fields[key];
const sVal = (fields, key) => (f(fields, key) ? f(fields, key).stringValue ?? null : null);
const iVal = (fields, key) => {
  const v = f(fields, key);
  if (!v) return null;
  if (v.integerValue != null) return parseInt(v.integerValue, 10);
  if (v.doubleValue != null) return Number(v.doubleValue);
  return null;
};
const idOf = (doc) => doc.name.split("/").pop();

function parseMatch(doc) {
  const fields = doc.fields || {};
  let result = null;
  const r = f(fields, "result");
  if (r && r.mapValue) {
    const rf = r.mapValue.fields || {};
    result = {
      goals1: iVal(rf, "goals1") ?? 0,
      goals2: iVal(rf, "goals2") ?? 0,
      isFinal: rf.isFinal ? rf.isFinal.booleanValue : true,
    };
  }
  return {
    id: idOf(doc),
    date: sVal(fields, "date") || "",
    time: sVal(fields, "time") || "",
    num: iVal(fields, "num") ?? 0,
    group: sVal(fields, "group"), // null si nullValue
    result,
  };
}

function parsePrediction(doc) {
  const fields = doc.fields || {};
  return {
    id: idOf(doc),
    userId: sVal(fields, "userId") || "",
    matchId: sVal(fields, "matchId") || "",
    goals1: iVal(fields, "goals1") ?? 0,
    goals2: iVal(fields, "goals2") ?? 0,
    points: iVal(fields, "points") ?? 0,
    prevPoints: iVal(fields, "prevPoints"),
    afterMatchPoints: f(fields, "afterMatchPoints")
      ? f(fields, "afterMatchPoints").nullValue !== undefined
        ? null
        : iVal(fields, "afterMatchPoints")
      : undefined,
  };
}

async function patchPrediction(id, points, prevPoints, afterMatchPoints) {
  const fields = {
    points: { integerValue: String(points) },
    prevPoints: { integerValue: String(prevPoints) },
    afterMatchPoints:
      afterMatchPoints == null ? { nullValue: null } : { integerValue: String(afterMatchPoints) },
  };
  const mask =
    "updateMask.fieldPaths=points&updateMask.fieldPaths=prevPoints&updateMask.fieldPaths=afterMatchPoints";
  const res = await fetch(`${BASE}/predictions/${id}?${mask}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH prediction ${id}: HTTP ${res.status} ${await res.text()}`);
}

async function patchUserPoints(uid, points) {
  const res = await fetch(`${BASE}/users/${uid}?updateMask.fieldPaths=points`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify({ fields: { points: { integerValue: String(points) } } }),
  });
  if (!res.ok) throw new Error(`PATCH user ${uid}: HTTP ${res.status} ${await res.text()}`);
}

// --- Cálculo acumulado (idéntico a computeCumulativePoints) -----------------

function computeCumulative(predictions, matches) {
  const sortedMatches = [...matches].sort((a, b) => {
    const da = getMatchStartDate(a).getTime();
    const db = getMatchStartDate(b).getTime();
    if (da !== db) return da - db;
    return a.num - b.num;
  });
  const orderById = new Map(sortedMatches.map((m, i) => [m.id, i]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const byUser = new Map();
  for (const p of predictions) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId).push(p);
  }

  const byPrediction = new Map();
  const userTotals = new Map();

  for (const [userId, preds] of byUser) {
    preds.sort((a, b) => {
      const oa = orderById.has(a.matchId) ? orderById.get(a.matchId) : Number.MAX_SAFE_INTEGER;
      const ob = orderById.has(b.matchId) ? orderById.get(b.matchId) : Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    let running = 0;
    for (const p of preds) {
      const m = matchById.get(p.matchId);
      let points = 0;
      let isFinal = false;
      if (m && m.result) {
        isFinal = m.result.isFinal !== false;
        points = calculatePoints(p.goals1, p.goals2, m.result.goals1, m.result.goals2, m.group);
      }
      const prevPoints = running;
      let afterMatchPoints = null;
      if (isFinal) {
        afterMatchPoints = running + points;
        running = afterMatchPoints;
      }
      byPrediction.set(p.id, { points, prevPoints, afterMatchPoints });
    }
    userTotals.set(userId, running);
  }

  return { byPrediction, userTotals, orderById };
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log(`Emulador: ${HOST}  Proyecto: ${PROJECT}  Modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (solo muestra)"}\n`);

  const [matchDocs, predDocs, userDocs] = await Promise.all([
    fetchCollection("matches"),
    fetchCollection("predictions"),
    fetchCollection("users"),
  ]);

  const matches = matchDocs.map(parseMatch);
  const predictions = predDocs.map(parsePrediction);
  const users = userDocs.map((d) => ({ id: idOf(d), name: sVal(d.fields, "displayName") || sVal(d.fields, "email") || idOf(d) }));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  console.log(`Partidos: ${matches.length} · Predicciones: ${predictions.length} · Usuarios: ${users.length}`);
  console.log(`Partidos finalizados: ${matches.filter((m) => m.result && m.result.isFinal !== false).length}\n`);

  const { byPrediction, userTotals } = computeCumulative(predictions, matches);

  // Diferencias de predicción
  let predChanges = 0;
  for (const p of predictions) {
    const cp = byPrediction.get(p.id);
    if (!cp) continue;
    const before = `pts=${p.points} prev=${p.prevPoints ?? "∅"} after=${p.afterMatchPoints === undefined ? "∅" : p.afterMatchPoints}`;
    const after = `pts=${cp.points} prev=${cp.prevPoints} after=${cp.afterMatchPoints}`;
    const changed =
      p.points !== cp.points ||
      (p.prevPoints ?? null) !== cp.prevPoints ||
      (p.afterMatchPoints ?? null) !== cp.afterMatchPoints;
    if (changed) predChanges++;
  }
  console.log(`Predicciones a actualizar: ${predChanges} / ${predictions.length}`);

  // Totales por usuario (antes vs después)
  console.log("\nTotales por usuario (después del recálculo):");
  for (const u of users) {
    const total = userTotals.get(u.id) || 0;
    console.log(`  ${u.name}: ${total} pts`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: no se escribió nada. Re-ejecuta con --apply para persistir.");
    return;
  }

  console.log("\nEscribiendo cambios...");
  let written = 0;
  for (const p of predictions) {
    const cp = byPrediction.get(p.id);
    if (!cp) continue;
    const changed =
      p.points !== cp.points ||
      (p.prevPoints ?? null) !== cp.prevPoints ||
      (p.afterMatchPoints ?? null) !== cp.afterMatchPoints;
    if (changed) {
      await patchPrediction(p.id, cp.points, cp.prevPoints, cp.afterMatchPoints);
      written++;
    }
  }
  for (const u of users) {
    await patchUserPoints(u.id, userTotals.get(u.id) || 0);
  }
  console.log(`✅ Listo. ${written} predicciones y ${users.length} usuarios actualizados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
