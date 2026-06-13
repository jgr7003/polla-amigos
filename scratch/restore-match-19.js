const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function restore() {
  try {
    const matchData = {
      id: "19",
      round: "Matchday 1",
      date: "2026-06-12",
      time: "18:00 UTC-4",
      team1: "USA",
      team2: "Paraguay",
      group: "Group D",
      ground: "Bay Area (Santa Clara)",
      num: 19,
      result: { goals1: 4, goals2: 1, isFinal: true }
    };

    await db.collection("matches").doc("19").set(matchData);
    console.log("Successfully restored match 19 (USA vs Paraguay) in Firestore!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to restore match:", err);
    process.exit(1);
  }
}

restore();
