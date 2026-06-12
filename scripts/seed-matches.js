const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
  projectId: "polla-amigos-2026-sb",
  appId: "1:315457424089:web:c46aecfb416412ec98ccc8",
  apiKey: "AIzaSyCCFy6fLQxany27tLD9KhlHhpTjDycg_2g",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  const jsonPath = path.join(__dirname, '../src/app/worldcup2026.json');
  const fileData = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(fileData);
  
  console.log(`Starting import of ${data.matches.length} matches...`);
  
  for (let i = 0; i < data.matches.length; i++) {
    const match = data.matches[i];
    const matchId = String(i + 1); // 1 to 104
    
    const matchData = {
      id: matchId,
      round: match.round,
      date: match.date,
      time: match.time,
      team1: match.team1,
      team2: match.team2,
      group: match.group || null,
      ground: match.ground,
      num: match.num || Number(matchId),
      result: null // will be updated when match is played
    };
    
    await setDoc(doc(db, "matches", matchId), matchData);
    console.log(`Uploaded match ${matchId}: ${match.team1} vs ${match.team2}`);
  }
  
  console.log("Success! All matches uploaded.");
  process.exit(0);
}

seed().catch(err => {
  console.error("Error seeding matches:", err);
  process.exit(1);
});
