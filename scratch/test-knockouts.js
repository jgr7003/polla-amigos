async function testKnockouts() {
  try {
    const apiUrl = "https://worldcup26.ir/get/games";
    const res = await fetch(apiUrl);
    const data = await res.json();
    const games = data.games || [];
    
    const knockoutGames = games.filter(g => g.type !== "group");
    console.log(`Found ${knockoutGames.length} knockout games in API.`);
    
    if (knockoutGames.length > 0) {
      console.log("First 3 knockout games in API:");
      console.log(JSON.stringify(knockoutGames.slice(0, 3), null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}
testKnockouts();
