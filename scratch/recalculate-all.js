const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Official Points System
function calculatePoints(predGoals1, predGoals2, realGoals1, realGoals2) {
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
  
  // 2. Solo Resultado - Ganador o Empate (3 Puntos)
  if (correctOutcome) {
    return 3;
  }
  
  // 3. Marcador Parcial (1 Punto)
  if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
    return 1;
  }
  
  return 0;
}

async function recalculateAll() {
  console.log("=== Starting Global Points Recalculation ===\n");

  try {
    // 1. Load matches
    console.log("Fetching matches...");
    const matchesSnap = await db.collection("matches").get();
    const matchesMap = {};
    matchesSnap.forEach(doc => {
      matchesMap[doc.id] = doc.data();
    });
    console.log(`Loaded ${Object.keys(matchesMap).length} matches.\n`);

    // 2. Load predictions
    console.log("Fetching predictions...");
    const predsSnap = await db.collection("predictions").get();
    console.log(`Loaded ${predsSnap.size} predictions.`);

    const userPointsMap = {};
    let updatedPredsCount = 0;

    // Use a batch or individual updates (with concurrency control)
    const batch = db.batch();
    let batchOperationCount = 0;

    const predictionsToUpdate = [];

    predsSnap.forEach(pDoc => {
      const pred = pDoc.data();
      const match = matchesMap[pred.matchId];

      let pts = 0;
      if (match && match.result !== undefined && match.result !== null) {
        pts = calculatePoints(
          parseInt(pred.goals1 || 0, 10),
          parseInt(pred.goals2 || 0, 10),
          parseInt(match.result.goals1 || 0, 10),
          parseInt(match.result.goals2 || 0, 10)
        );
      }

      // If prediction points in DB differ from newly calculated points
      if (pred.points !== pts) {
        predictionsToUpdate.push({ ref: pDoc.ref, prev: pred.points, next: pts, matchId: pred.matchId, userId: pred.userId });
      }

      // Add points to user sum if match is finalized
      if (!userPointsMap[pred.userId]) {
        userPointsMap[pred.userId] = 0;
      }
      
      const isFinal = match && match.result ? (match.result.isFinal !== false) : false;
      if (isFinal) {
        userPointsMap[pred.userId] += pts;
      }
    });

    // Write prediction points updates
    console.log(`Updating ${predictionsToUpdate.length} predictions in Firestore...`);
    
    // We can write updates in chunks of 500 (Firestore batch limit)
    let currentBatch = db.batch();
    let countInBatch = 0;

    for (const update of predictionsToUpdate) {
      currentBatch.update(update.ref, { points: update.next });
      countInBatch++;
      updatedPredsCount++;

      if (countInBatch === 400) {
        await currentBatch.commit();
        console.log(`  Committed batch of ${countInBatch} predictions...`);
        currentBatch = db.batch();
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await currentBatch.commit();
      console.log(`  Committed final batch of ${countInBatch} predictions.`);
    }

    // 3. Update user profiles points
    console.log("\nUpdating user profile totals...");
    const usersSnap = await db.collection("users").get();
    
    let userBatch = db.batch();
    let userCountInBatch = 0;
    let updatedUsersCount = 0;

    usersSnap.forEach(uDoc => {
      const uid = uDoc.id;
      const prevPoints = uDoc.data().points || 0;
      const nextPoints = userPointsMap[uid] || 0;

      if (prevPoints !== nextPoints) {
        userBatch.update(uDoc.ref, { points: nextPoints });
        userCountInBatch++;
        updatedUsersCount++;
        console.log(`  User ${uDoc.data().displayName || uid} (${uDoc.data().email}): ${prevPoints} -> ${nextPoints} pts`);

        if (userCountInBatch === 400) {
          userBatch.commit();
          userBatch = db.batch();
          userCountInBatch = 0;
        }
      }
    });

    if (userCountInBatch > 0) {
      await userBatch.commit();
    }

    console.log(`\n=== Recalculation Summary ===`);
    console.log(`- Predictions updated: ${updatedPredsCount}`);
    console.log(`- Users updated: ${updatedUsersCount}`);
    console.log(`- Successful!`);

    process.exit(0);
  } catch (err) {
    console.error("Error during recalculation:", err);
    process.exit(1);
  }
}

recalculateAll();
