const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function fixPredictions() {
  try {
    console.log("Fetching all predictions...");
    const predsSnap = await db.collection("predictions").get();
    let fixCount = 0;

    for (const doc of predsSnap.docs) {
      const data = doc.data();
      if (!data.userId || data.userId === "undefined" || data.userId === null) {
        console.log(`Found corrupted prediction: ${doc.id}`);
        const parts = doc.id.split('_');
        if (parts.length === 2) {
          const userId = parts[0];
          const matchId = parts[1];
          
          const updateData = {
            id: doc.id,
            userId: userId,
            matchId: matchId,
            goals1: 0,
            goals2: 0,
            points: data.points || 0
          };

          await db.collection("predictions").doc(doc.id).set(updateData, { merge: true });
          console.log(`Restored fields for prediction ${doc.id} (user: ${userId}, match: ${matchId}, points: ${data.points})`);
          fixCount++;
        } else {
          console.warn(`Could not parse document ID: ${doc.id}`);
        }
      }
    }

    console.log(`Successfully fixed ${fixCount} corrupted predictions!`);
    process.exit(0);
  } catch (err) {
    console.error("Error fixing predictions:", err);
    process.exit(1);
  }
}

fixPredictions();
