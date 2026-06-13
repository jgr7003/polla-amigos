const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountPath = "/Users/santiagobarrera/Downloads/polla-amigos-2026-sb-firebase-adminsdk-fbsvc-287270755b.json";
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function inspect() {
  const predsSnap = await db.collection("predictions").get();
  console.log(`Total predictions: ${predsSnap.size}`);
  
  predsSnap.forEach(doc => {
    const data = doc.data();
    if (!data.userId || data.userId === "undefined" || data.userId === null) {
      console.log(`Prediction ${doc.id} has invalid userId:`, data);
    }
  });
  console.log("Done inspecting predictions.");
  process.exit(0);
}

inspect();
