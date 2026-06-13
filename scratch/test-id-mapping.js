const fs = require('fs');

async function checkIds() {
  try {
    const apiUrl = "https://worldcup26.ir/get/games";
    const apiResponse = await fetch(apiUrl);
    const apiData = await apiResponse.json();
    const apiFixtures = apiData.games || [];

    const localJsonPath = "/Users/santiagobarrera/Documents/1-desarrollo/polla-futbolera/src/app/worldcup2026.json";
    const fileData = fs.readFileSync(localJsonPath, 'utf8');
    const localData = JSON.parse(fileData);
    const dbMatches = localData.matches;

    console.log("Checking match ID alignments between local JSON and external API:");
    
    let matchesCount = 0;
    let mismatches = [];

    // Check first 72 matches (Group stage)
    for (let i = 0; i < 72; i++) {
      const dbMatch = dbMatches[i];
      const matchNum = dbMatch.num || (i + 1);
      const fixture = apiFixtures.find(f => String(f.id) === String(matchNum));

      if (fixture) {
        matchesCount++;
        const apiHome = fixture.home_team_name_en;
        const apiAway = fixture.away_team_name_en;
        console.log(`ID ${matchNum}: Local [${dbMatch.team1} vs ${dbMatch.team2}] | API [${apiHome} vs ${apiAway}]`);
      } else {
        mismatches.push(`No API fixture found for ID ${matchNum} (${dbMatch.team1} vs ${dbMatch.team2})`);
      }
    }
    
    console.log(`\nGroup stage ID matches: ${matchesCount} / 72`);
    if (mismatches.length > 0) {
      console.log("Mismatches/Missing:");
      mismatches.forEach(m => console.log(m));
    }
  } catch (err) {
    console.error(err);
  }
}

checkIds();
