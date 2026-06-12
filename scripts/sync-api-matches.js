const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("Error: FIREBASE_SERVICE_ACCOUNT environment variable is not defined.");
  process.exit(1);
}

const apiFootballKey = process.env.API_FOOTBALL_KEY;
if (!apiFootballKey) {
  console.error("Error: API_FOOTBALL_KEY environment variable is not defined.");
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (err) {
  console.error("Error initializing Firebase Admin SDK (invalid JSON):", err);
  process.exit(1);
}

const db = admin.firestore();

// Points calculator logic
function calculatePoints(predGoals1, predGoals2, realGoals1, realGoals2) {
  if (predGoals1 === realGoals1 && predGoals2 === realGoals2) {
    return 5;
  }
  
  const predDiff = predGoals1 - predGoals2;
  const realDiff = realGoals1 - realGoals2;
  
  if (
    (predDiff > 0 && realDiff > 0) || // Gana equipo 1
    (predDiff < 0 && realDiff < 0) || // Gana equipo 2
    (predDiff === 0 && realDiff === 0)    // Empate
  ) {
    return 3;
  }
  
  return 0;
}

// Clean helper to match team names (e.g. "Czech Republic" -> "czechrepublic")
function cleanName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function run() {
  console.log("Starting API scores sync...");

  // 2. Fetch matches from API-Football
  // League ID 1 is FIFA World Cup, season 2026
  const apiUrl = "https://v3.football.api-sports.io/fixtures?league=1&season=2026";
  const apiResponse = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "x-rapidapi-key": apiFootballKey,
      "x-rapidapi-host": "v3.football.api-sports.io"
    }
  });

  if (!apiResponse.ok) {
    throw new Error(`API-Football request failed with status: ${apiResponse.status}`);
  }

  const apiData = await apiResponse.json();
  if (apiData.errors && Object.keys(apiData.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(apiData.errors)}`);
  }

  const apiFixtures = apiData.response || [];
  console.log(`Fetched ${apiFixtures.length} fixtures from API-Football.`);

  // 3. Fetch current matches from Firestore
  const matchesSnap = await db.collection("matches").get();
  const dbMatches = [];
  matchesSnap.forEach(doc => {
    dbMatches.push({ ...doc.data(), id: doc.id });
  });

  let updatedMatchesCount = 0;

  // 4. Match and update scores
  for (const dbMatch of dbMatches) {
    // Find matching fixture in API by team names
    const fixture = apiFixtures.find(f => {
      const apiHome = f.teams.home.name;
      const apiAway = f.teams.away.name;
      return (
        (cleanName(apiHome) === cleanName(dbMatch.team1) && cleanName(apiAway) === cleanName(dbMatch.team2)) ||
        (cleanName(apiHome) === cleanName(dbMatch.team2) && cleanName(apiAway) === cleanName(dbMatch.team1))
      );
    });

    if (!fixture) continue;

    const statusShort = fixture.fixture.status.short;
    const goalsHome = fixture.goals.home;
    const goalsAway = fixture.goals.away;

    // Check if goals are defined
    if (goalsHome !== null && goalsAway !== null) {
      const isFinal = ["FT", "AET", "PEN"].includes(statusShort);
      const isLive = ["1H", "2H", "HT", "ET", "P", "LIVE"].includes(statusShort);

      if (isFinal || isLive) {
        // Determine goals mapping in case home/away teams are reversed in API
        let realGoals1 = goalsHome;
        let realGoals2 = goalsAway;

        if (cleanName(fixture.teams.home.name) === cleanName(dbMatch.team2)) {
          // Teams are reversed
          realGoals1 = goalsAway;
          realGoals2 = goalsHome;
        }

        const currentResult = dbMatch.result;
        const newResult = { goals1: realGoals1, goals2: realGoals2, isFinal };

        // Check if result changed
        const hasChanged = !currentResult || 
          currentResult.goals1 !== newResult.goals1 || 
          currentResult.goals2 !== newResult.goals2 || 
          currentResult.isFinal !== newResult.isFinal;

        if (hasChanged) {
          console.log(`Updating match ${dbMatch.id} (${dbMatch.team1} vs ${dbMatch.team2}): ${newResult.goals1} - ${newResult.goals2} (isFinal: ${newResult.isFinal})`);
          await db.collection("matches").doc(dbMatch.id).update({ result: newResult });
          updatedMatchesCount++;
          dbMatch.result = newResult; // Update local reference for recalculation
        }
      }
    }
  }

  console.log(`Successfully updated ${updatedMatchesCount} matches.`);

  // 5. If matches were updated, run full recalculation
  if (updatedMatchesCount > 0) {
    console.log("Recalculating all user scores...");

    // Refetch matches to have fresh data
    const freshMatchesSnap = await db.collection("matches").get();
    const freshMatchesMap = {};
    freshMatchesSnap.forEach(doc => {
      freshMatchesMap[doc.id] = doc.data();
    });

    const predsSnap = await db.collection("predictions").get();
    const userPointsMap = {};
    const batch = db.batch();

    predsSnap.forEach(pDoc => {
      const pred = pDoc.data();
      const match = freshMatchesMap[pred.matchId];
      
      let pts = 0;
      if (match && match.result) {
        pts = calculatePoints(pred.goals1, pred.goals2, match.result.goals1, match.result.goals2);
      }

      if (pred.points !== pts) {
        batch.update(db.collection("predictions").doc(pred.id), { points: pts });
      }

      if (!userPointsMap[pred.userId]) {
        userPointsMap[pred.userId] = 0;
      }
      userPointsMap[pred.userId] += pts;
    });

    // Update user profile points
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach(uDoc => {
      const uid = uDoc.id;
      const pts = userPointsMap[uid] || 0;
      batch.update(db.collection("users").doc(uid), { points: pts });
    });

    await batch.commit();
    console.log("Success! All user scores and predictions recalculated.");
  } else {
    console.log("No match scores changed. Skipping score recalculation.");
  }
}

run().catch(err => {
  console.error("Sync script failed:", err);
  process.exit(1);
});
