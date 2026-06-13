const fs = require('fs');
const readline = require('readline');

const logPath = "/Users/santiagobarrera/.gemini/antigravity-ide/brain/a0d60233-8c6c-4e54-95c0-e2599bc943f1/.system_generated/logs/transcript.jsonl";

async function scan() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    // Check if line contains prediction data like 'goals1' and 'matchId' and 'userId' together
    if (line.includes('"matchId"') && line.includes('"goals1"') && line.includes('"userId"')) {
      console.log(`Line ${lineCount} contains prediction JSON:`);
      console.log(line.substring(0, 1000));
      console.log("-----------------------------------------");
    }
  }
  console.log(`Total lines scanned: ${lineCount}`);
}

scan();
