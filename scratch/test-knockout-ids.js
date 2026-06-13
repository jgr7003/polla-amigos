const fs = require('fs');

async function checkKnockoutIds() {
  try {
    const apiUrl = "https://worldcup26.ir/get/games";
    const apiResponse = await fetch(apiUrl);
    const apiData = await apiResponse.json();
    const apiFixtures = apiData.games || [];

    const localJsonPath = "/Users/santiagobarrera/Documents/1-desarrollo/polla-futbolera/src/app/worldcup2026.json";
    const fileData = fs.readFileSync(localJsonPath, 'utf8');
    const localData = JSON.parse(fileData);
    const dbMatches = localData.matches;

    console.log("Comparing knockout stage matches (73 to 104):");
    
    let aligned = 0;
    for (let num = 73; num <= 104; num++) {
      const dbMatch = dbMatches[num - 1]; // 0-indexed
      const fixture = apiFixtures.find(f => String(f.id) === String(num));
      if (fixture) {
        const apiHome = fixture.home_team_label || fixture.home_team_name_en;
        const apiAway = fixture.away_team_label || fixture.away_team_name_en;
        console.log(`ID ${num}: Local [${dbMatch.team1} vs ${dbMatch.team2}] | API [${apiHome} vs ${apiAway}]`);
        aligned++;
      } else {
        console.log(`ID ${num}: Local [${dbMatch.team1} vs ${dbMatch.team2}] | API [NOT FOUND]`);
      }
    }
    console.log(`Total knockout matches aligned: ${aligned} / 32`);
  } catch (err) {
    console.error(err);
  }
}

checkKnockoutIds();
