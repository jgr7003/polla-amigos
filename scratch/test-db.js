const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function test() {
  console.log("Fetching first prediction...");
  const snap = await db.collection("predictions").limit(5).get();
  snap.forEach(doc => {
    console.log("ID:", doc.id);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
    console.log("Type of matchId:", typeof doc.data().matchId);
  });
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
