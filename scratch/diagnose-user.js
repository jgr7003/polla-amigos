const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";

initializeApp({
  credential: cert(serviceAccountPath)
});

const db = getFirestore();

// Ported from src/lib/scoreCalculator.ts
function calculatePoints(predGoals1, predGoals2, realGoals1, realGoals2) {
  if (predGoals1 === realGoals1 && predGoals2 === realGoals2) {
    return 5;
  }
  const predDiff = predGoals1 - predGoals2;
  const realDiff = realGoals1 - realGoals2;
  const correctOutcome =
    (predDiff > 0 && realDiff > 0) ||
    (predDiff < 0 && realDiff < 0) ||
    (predDiff === 0 && realDiff === 0);

  if (correctOutcome) {
    return 3;
  }
  if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
    return 1;
  }
  return 0;
}

async function diagnoseUser() {
  const userId = "ojUzzGDOGpTX8nW5SJytjUbPOCZ2";
  console.log(`=== Diagnosing user ID: ${userId} ===\n`);

  // 1. Get User Profile
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      console.log(`User Profile:`);
      console.log(`- Display Name: ${data.displayName || "N/A"}`);
      console.log(`- Email: ${data.email || "N/A"}`);
      console.log(`- Points in DB: ${data.points || 0}\n`);
    } else {
      console.log(`❌ User profile not found in Firestore.\n`);
    }
  } catch (err) {
    console.error("Error fetching user profile:", err);
  }

  // 2. Get All Matches
  const matchesMap = {};
  try {
    const matchesSnap = await db.collection("matches").get();
    matchesSnap.forEach(docSnap => {
      const data = docSnap.data();
      matchesMap[docSnap.id] = { id: docSnap.id, ...data };
    });
    console.log(`Loaded ${Object.keys(matchesMap).length} matches.\n`);
  } catch (err) {
    console.error("Error fetching matches:", err);
  }

  // 3. Get All Predictions for this user
  console.log("=== Predictions for user: ===");
  try {
    const predsSnap = await db.collection("predictions").where("userId", "==", userId).get();
    const userPreds = [];
    predsSnap.forEach(docSnap => {
      userPreds.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Link with match info and sort by match number
    userPreds.forEach(pred => {
      const match = matchesMap[pred.matchId];
      if (match) {
        pred.matchNum = parseInt(match.num);
        pred.matchInfo = match;
      } else {
        pred.matchNum = 999;
      }
    });
    userPreds.sort((a, b) => a.matchNum - b.matchNum);

    let totalCalculatedPoints = 0;
    let totalCalculatedDefinitivePoints = 0;
    let count = 0;

    userPreds.forEach(pred => {
      count++;
      const match = pred.matchInfo;
      if (!match) {
        console.log(`  ${count}. Prediction for unknown Match ID ${pred.matchId}: ${pred.goals1} - ${pred.goals2} (DB points: ${pred.points})`);
        return;
      }

      let calculatedPoints = 0;
      const hasResult = match.result !== undefined && match.result !== null;
      if (hasResult) {
        calculatedPoints = calculatePoints(pred.goals1, pred.goals2, match.result.goals1, match.result.goals2);
      }

      const isFinal = match.result ? match.result.isFinal : false;

      console.log(`  Match ${match.num}: ${match.team1} vs ${match.team2} (${match.round})`);
      console.log(`    - Prediction: ${pred.goals1} - ${pred.goals2}`);
      if (hasResult) {
        console.log(`    - Real Result: ${match.result.goals1} - ${match.result.goals2} (isFinal: ${isFinal})`);
        console.log(`    - DB Points field in pred document: ${pred.points} | Dynamically Calculated points: ${calculatedPoints}`);
        if (isFinal !== false) {
          totalCalculatedDefinitivePoints += calculatedPoints;
        }
        totalCalculatedPoints += calculatedPoints;
      } else {
        console.log(`    - Real Result: NOT PLAYED YET`);
        console.log(`    - DB Points field in pred document: ${pred.points}`);
      }
      console.log("");
    });

    console.log(`Summary:`);
    console.log(`- Total Predictions: ${count}`);
    console.log(`- Sum of Calculated Definitive Points (only matches with result and isFinal=true): ${totalCalculatedDefinitivePoints}`);
    console.log(`- Sum of All Calculated Points (including provisional/live): ${totalCalculatedPoints}`);
  } catch (err) {
    console.error("Error fetching predictions:", err);
  }
}

diagnoseUser().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
