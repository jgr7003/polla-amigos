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
  console.log("Fetching all matches...");
  const snap = await db.collection("matches").get();
  const matches = [];
  snap.forEach(doc => {
    matches.push({ id: doc.id, ...doc.data() });
  });

  console.log(`Total matches fetched: ${matches.length}`);

  // Sort matches by num
  matches.sort((a, b) => a.num - b.num);

  // Group by date
  const groups = {};
  matches.forEach(m => {
    if (!groups[m.date]) {
      groups[m.date] = [];
    }
    groups[m.date].push(m);
  });

  console.log("Matches by date:");
  for (const date in groups) {
    console.log(`\nDate: ${date} (Count: ${groups[date].length})`);
    groups[date].forEach(m => {
      console.log(`  Match #${m.num}: ${m.team1} vs ${m.team2} - Round: ${m.round} - Time: ${m.time} - Result: ${JSON.stringify(m.result)}`);
    });
  }

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
