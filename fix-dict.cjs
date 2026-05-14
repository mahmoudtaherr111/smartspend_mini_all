const fs = require('fs');
let content = fs.readFileSync('api/lib/egyptian-dictionary.ts', 'utf-8');
const dictRegex = /export const CATEGORY_DICTIONARY: Record<string, string> = \{([^\}]*)\};/s;
const match = content.match(dictRegex);

if (match) {
  let inner = match[1];
  const pairs = [...inner.matchAll(/"([^"]+)":\s*"([^"]+)"/g)];
  const unique = {};
  const cleanedPairs = [];
  
  pairs.forEach(p => {
    if (!unique[p[1]]) {
      unique[p[1]] = p[2];
      cleanedPairs.push(`  "${p[1]}": "${p[2]}"`);
    } else {
      console.log('Found duplicate:', p[1]);
    }
  });

  const newInner = '\n' + cleanedPairs.join(',\n') + '\n';
  content = content.replace(dictRegex, 'export const CATEGORY_DICTIONARY: Record<string, string> = {' + newInner + '};');
  fs.writeFileSync('api/lib/egyptian-dictionary.ts', content);
  console.log('Duplicates removed!');
} else {
  console.log('Could not parse dictionary.');
}
