const fs = require('fs');
const readline = require('readline');

const logPath = "/Users/santiagobarrera/.gemini/antigravity-ide/brain/a0d60233-8c6c-4e54-95c0-e2599bc943f1/.system_generated/logs/transcript.jsonl";

async function findPredictions() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const targetIds = [
    "9GZXIKAQtBYWiLmLhUlQ94TqXLZ2_19",
    "BhaBtJESBHdJPqIkFmmTm4JhPdj1_19",
    "EpNKDJrZ2LdXdMF22RGcqExqC0D3_19",
    "aBtw21HHGhWK7sijFGaQ8vs4pOx1_19",
    "ojUzzGDOGpTX8nW5SJytjUbPOCZ2_19",
    "vVs4tVQtWoQp1bPHMOsp3h4chsu2_19",
    "wBBYfZsLY0bOBZ2fiN0iHgwe7l73_19"
  ];

  for await (const line of rl) {
    for (const id of targetIds) {
      if (line.includes(id)) {
        console.log(`FOUND ID: ${id}`);
        // Print surrounding context or the line itself
        // Let's print clean representation if it's JSON
        try {
          const obj = JSON.parse(line);
          console.log(JSON.stringify(obj, null, 2).substring(0, 1000));
        } catch (e) {
          console.log(line.substring(0, 500));
        }
        console.log("-----------------------------------------");
      }
    }
  }
}

findPredictions();
