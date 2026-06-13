const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function reconstruct() {
  try {
    const targets = [
      { id: "9GZXIKAQtBYWiLmLhUlQ94TqXLZ2_19", points: 2, goals1: 2, goals2: 1 },
      { id: "BhaBtJESBHdJPqIkFmmTm4JhPdj1_19", points: 2, goals1: 2, goals2: 1 },
      { id: "EpNKDJrZ2LdXdMF22RGcqExqC0D3_19", points: 2, goals1: 2, goals2: 1 },
      { id: "aBtw21HHGhWK7sijFGaQ8vs4pOx1_19", points: 1, goals1: 1, goals2: 1 },
      { id: "ojUzzGDOGpTX8nW5SJytjUbPOCZ2_19", points: 2, goals1: 2, goals2: 1 },
      { id: "vVs4tVQtWoQp1bPHMOsp3h4chsu2_19", points: 2, goals1: 2, goals2: 1 },
      { id: "wBBYfZsLY0bOBZ2fiN0iHgwe7l73_19", points: 1, goals1: 1, goals2: 1 }
    ];

    for (const target of targets) {
      await db.collection("predictions").doc(target.id).set({
        goals1: target.goals1,
        goals2: target.goals2
      }, { merge: true });
      console.log(`Reconstructed goals for ${target.id} to ${target.goals1}-${target.goals2} (points: ${target.points})`);
    }

    console.log("Reconstruction completed!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

reconstruct();
