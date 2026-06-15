const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 1. Initialize Firebase Admin SDK
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("Error: FIREBASE_SERVICE_ACCOUNT environment variable is not defined.");
  process.exit(1);
}


let app;
try {
  const serviceAccount = JSON.parse(serviceAccountJson);
  app = initializeApp({
    credential: cert(serviceAccount)
  });
} catch (err) {
  console.error("Error initializing Firebase Admin SDK (invalid JSON):", err);
  process.exit(1);
}

const db = getFirestore();

// Points calculator logic
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
  
  // 2. Acierto de Resultado (3 Puntos)
  if (correctOutcome) {
    return 3;
  }
  
  // 3. Marcador Parcial (1 Punto)
  if (predGoals1 === realGoals1 || predGoals2 === realGoals2) {
    return 1;
  }
  
  return 0;
}

// Map API team names to DB canonical team names
function mapApiTeamToDbTeam(apiTeam) {
  if (!apiTeam) return "";
  const clean = apiTeam.trim();
  if (clean === "United States") return "USA";
  if (clean === "Democratic Republic of the Congo") return "DR Congo";
  if (clean === "Bosnia and Herzegovina") return "Bosnia & Herzegovina";
  return clean;
}

// Clean helper to match team names (e.g. "Czech Republic" -> "czechrepublic")
function cleanName(name) {
  if (!name) return "";
  let clean = name.toLowerCase().trim();
  if (clean === "usa" || clean === "united states") return "unitedstates";
  if (clean === "dr congo" || clean === "democratic republic of the congo") return "democraticrepublicofthecongo";
  
  // Replace & with "and" before stripping other characters
  clean = clean.replace(/&/g, "and");
  return clean.replace(/[^a-z0-9]/g, "");
}

async function run() {
  console.log("Starting API scores sync...");

// 2. Fetch matches from worldcup26.ir API
  const apiUrl = "https://worldcup26.ir/get/games";
  const apiResponse = await fetch(apiUrl, {
    method: "GET"
  });

  if (!apiResponse.ok) {
    throw new Error(`WorldCup2026 API request failed with status: ${apiResponse.status}`);
  }

  const apiData = await apiResponse.json();
  const apiFixtures = apiData.games || [];
  console.log(`Fetched ${apiFixtures.length} fixtures from WorldCup2026 API.`);

  // 3. Fetch current matches from Firestore
  const matchesSnap = await db.collection("matches").get();
  const dbMatches = [];
  matchesSnap.forEach(doc => {
    dbMatches.push({ ...doc.data(), id: doc.id });
  });

  let updatedMatchesCount = 0;

  // 4. Match and update scores
  for (const dbMatch of dbMatches) {
    const dbMatchIdNum = parseInt(dbMatch.id, 10);
    let fixture = null;

    if (dbMatchIdNum >= 73) {
      // Knockout stage: match directly by ID
      fixture = apiFixtures.find(f => parseInt(f.id, 10) === dbMatchIdNum);
    } else {
      // Group stage: match by team names (using robust cleanName)
      fixture = apiFixtures.find(f => {
        const apiHome = f.home_team_name_en;
        const apiAway = f.away_team_name_en;
        return (
          (cleanName(apiHome) === cleanName(dbMatch.team1) && cleanName(apiAway) === cleanName(dbMatch.team2)) ||
          (cleanName(apiHome) === cleanName(dbMatch.team2) && cleanName(apiAway) === cleanName(dbMatch.team1))
        );
      });
    }

    if (!fixture) continue;

    // Update team names for knockouts if determined
    let teamNamesChanged = false;
    let updatedTeam1 = dbMatch.team1;
    let updatedTeam2 = dbMatch.team2;

    if (dbMatchIdNum >= 73 && fixture.home_team_name_en && fixture.away_team_name_en) {
      const mappedHome = mapApiTeamToDbTeam(fixture.home_team_name_en);
      const mappedAway = mapApiTeamToDbTeam(fixture.away_team_name_en);

      if (mappedHome !== dbMatch.team1 || mappedAway !== dbMatch.team2) {
        updatedTeam1 = mappedHome;
        updatedTeam2 = mappedAway;
        teamNamesChanged = true;
      }
    }

    // In worldcup26.ir API:
    // finished is "TRUE" or "FALSE"
    // time_elapsed is "finished", "notstarted", or live indicators like "1st-half", etc.
    const isFinished = fixture.finished === "TRUE";
    const isStarted = fixture.time_elapsed !== "notstarted";

    let resultChanged = false;
    let newResult = dbMatch.result;

    if (isStarted || isFinished) {
      const goalsHome = parseInt(fixture.home_score, 10);
      const goalsAway = parseInt(fixture.away_score, 10);

      if (!isNaN(goalsHome) && !isNaN(goalsAway)) {
        // Determine goals mapping in case home/away teams are reversed in API compared to dbMatch
        let realGoals1 = goalsHome;
        let realGoals2 = goalsAway;

        const checkHome = fixture.home_team_name_en || fixture.home_team_label;
        if (checkHome && cleanName(checkHome) === cleanName(dbMatch.team2)) {
          // Teams are reversed
          realGoals1 = goalsAway;
          realGoals2 = goalsHome;
        }

        newResult = { goals1: realGoals1, goals2: realGoals2, isFinal: isFinished };

        const currentResult = dbMatch.result;
        resultChanged = !currentResult || 
          currentResult.goals1 !== newResult.goals1 || 
          currentResult.goals2 !== newResult.goals2 || 
          currentResult.isFinal !== newResult.isFinal;
      }
    }

    if (resultChanged || teamNamesChanged) {
      const updateData = {};
      if (resultChanged) {
        updateData.result = newResult;
      }
      if (teamNamesChanged) {
        updateData.team1 = updatedTeam1;
        updateData.team2 = updatedTeam2;
        console.log(`Updating teams for match ${dbMatch.id}: ${dbMatch.team1} vs ${dbMatch.team2} -> ${updatedTeam1} vs ${updatedTeam2}`);
      }

      if (resultChanged) {
        console.log(`Updating result for match ${dbMatch.id} (${updatedTeam1} vs ${updatedTeam2}): ${newResult.goals1} - ${newResult.goals2} (isFinal: ${newResult.isFinal})`);
      }

      await db.collection("matches").doc(dbMatch.id).update(updateData);
      updatedMatchesCount++;

      // Update local reference for recalculation
      dbMatch.result = newResult;
      dbMatch.team1 = updatedTeam1;
      dbMatch.team2 = updatedTeam2;
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
      const isFinal = match?.result ? (match.result.isFinal ?? true) : false;
      if (isFinal) {
        userPointsMap[pred.userId] += pts;
      }
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
