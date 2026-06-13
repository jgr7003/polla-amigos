const fs = require('fs');

function cleanName(name) {
  if (!name) return "";
  let clean = name.toLowerCase().trim();
  if (clean === "usa") return "unitedstates";
  if (clean === "dr congo") return "democraticrepublicofthecongo";
  
  // Replace & with "and" before stripping other characters
  clean = clean.replace(/&/g, "and");
  return clean.replace(/[^a-z0-9]/g, "");
}

async function testGroupMapping() {
  try {
    const apiUrl = "https://worldcup26.ir/get/games";
    const apiResponse = await fetch(apiUrl);
    const apiData = await apiResponse.json();
    const apiFixtures = apiData.games || [];

    const localJsonPath = "/Users/santiagobarrera/Documents/1-desarrollo/polla-futbolera/src/app/worldcup2026.json";
    const fileData = fs.readFileSync(localJsonPath, 'utf8');
    const localData = JSON.parse(fileData);
    const dbMatches = localData.matches;

    let matchedCount = 0;
    let unmatched = [];

    // Only group stage (1-72)
    for (let i = 0; i < 72; i++) {
      const dbMatch = dbMatches[i];
      const matchId = String(i + 1);

      const fixture = apiFixtures.find(f => {
        const apiHome = f.home_team_name_en;
        const apiAway = f.away_team_name_en;
        return (
          (cleanName(apiHome) === cleanName(dbMatch.team1) && cleanName(apiAway) === cleanName(dbMatch.team2)) ||
          (cleanName(apiHome) === cleanName(dbMatch.team2) && cleanName(apiAway) === cleanName(dbMatch.team1))
        );
      });

      if (fixture) {
        matchedCount++;
      } else {
        unmatched.push(`${dbMatch.team1} vs ${dbMatch.team2}`);
      }
    }

    console.log(`Group stage matches matched: ${matchedCount} / 72`);
    if (unmatched.length > 0) {
      console.log("Unmatched:", unmatched);
    }
  } catch (err) {
    console.error(err);
  }
}

testGroupMapping();
