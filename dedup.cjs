const fs = require("fs");
const file = "api/lib/egyptian-dictionary.ts";
let content = fs.readFileSync(file, "utf8");
let seen = new Set();
let lines = content.split("\n");
let out = [];
for (let line of lines) {
  let m = line.match(/^\s*"([^"]+)"\s*:\s*"[^"]+",/);
  if (m) {
    let key = m[1];
    if (seen.has(key)) {
      continue; // skip duplicate
    }
    seen.add(key);
  }
  out.push(line);
}
fs.writeFileSync(file, out.join("\n"));
console.log("deduplicated!");
