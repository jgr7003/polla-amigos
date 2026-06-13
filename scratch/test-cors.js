async function testCors() {
  const url = "https://worldcup26.ir/get/games";
  try {
    const res = await fetch(url);
    console.log("Headers:");
    for (const [key, value] of res.headers.entries()) {
      console.log(`${key}: ${value}`);
    }
  } catch (err) {
    console.error(err);
  }
}
testCors();
