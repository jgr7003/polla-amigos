async function test() {
  const url = "https://worldcup26.ir/get/games";
  try {
    const res = await fetch(url);
    const data = await res.json();
    const match = data.games.find(g => 
      g.home_team_name_en === "United States" || g.away_team_name_en === "United States"
    );
    console.log(JSON.stringify(match, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
