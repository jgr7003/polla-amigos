const admin = require('firebase-admin');



const FIREBASE_PROJECT_ID = "polla-futbolera-2026-sb";
const API_KEY = "AIzaSyC07i9gn4HRw8IjIrDJoN504-OZp2SPsTI";

async function checkPredictions() {
  // Qatar vs Switzerland is match 8 in the worldcup2026.json (0-indexed: 7, so matchId = "8")
  // Let's first find the correct match ID by checking all matches
  
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

  // Get all matches to find Qatar vs Switzerland
  console.log("=== Buscando partido Qatar vs Switzerland ===\n");
  
  const matchesRes = await globalThis.fetch(`${baseUrl}/matches?pageSize=200`);
  const matchesData = await matchesRes.json();
  
  let qatarMatchId = null;
  
  if (matchesData.documents) {
    for (const doc of matchesData.documents) {
      const fields = doc.fields;
      const team1 = fields.team1?.stringValue || "";
      const team2 = fields.team2?.stringValue || "";
      if ((team1.includes("Qatar") && team2.includes("Switz")) || 
          (team2.includes("Qatar") && team1.includes("Switz"))) {
        const id = doc.name.split('/').pop();
        const date = fields.date?.stringValue || "";
        const result = fields.result;
        console.log(`✅ Encontrado: Match ID = ${id}`);
        console.log(`   ${team1} vs ${team2} (Fecha: ${date})`);
        if (result && result.mapValue) {
          const resultFields = result.mapValue.fields;
          console.log(`   Resultado: ${resultFields.goals1?.integerValue || 0} - ${resultFields.goals2?.integerValue || 0} (isFinal: ${resultFields.isFinal?.booleanValue})`);
        } else {
          console.log(`   Resultado: Sin resultado aún`);
        }
        qatarMatchId = id;
      }
    }
  }

  if (!qatarMatchId) {
    console.log("❌ No se encontró el partido Qatar vs Switzerland");
    return;
  }

  // Now get all predictions for this match
  console.log(`\n=== Predicciones para el partido ${qatarMatchId} (Qatar vs Switzerland) ===\n`);
  
  const predsRes = await globalThis.fetch(`${baseUrl}/predictions?pageSize=500`);
  const predsData = await predsRes.json();
  
  // Also get users for display names
  const usersRes = await globalThis.fetch(`${baseUrl}/users?pageSize=100`);
  const usersData = await usersRes.json();
  
  const usersMap = {};
  if (usersData.documents) {
    for (const doc of usersData.documents) {
      const uid = doc.name.split('/').pop();
      const name = doc.fields.displayName?.stringValue || doc.fields.email?.stringValue || uid;
      usersMap[uid] = name;
    }
  }

  let predCount = 0;
  if (predsData.documents) {
    for (const doc of predsData.documents) {
      const fields = doc.fields;
      const matchId = fields.matchId?.stringValue || "";
      if (matchId === qatarMatchId) {
        predCount++;
        const userId = fields.userId?.stringValue || "???";
        const goals1 = fields.goals1?.integerValue || 0;
        const goals2 = fields.goals2?.integerValue || 0;
        const points = fields.points?.integerValue || 0;
        const userName = usersMap[userId] || userId;
        console.log(`  ${predCount}. ${userName}: ${goals1} - ${goals2} (${points} pts)`);
      }
    }
  }

  if (predCount === 0) {
    console.log("  ⚠️ NO HAY PREDICCIONES para este partido!");
  } else {
    console.log(`\n✅ Total: ${predCount} predicciones encontradas para Qatar vs Switzerland`);
  }
}

checkPredictions().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
