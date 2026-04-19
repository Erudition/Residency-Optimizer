const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  let files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(walkDir(fullPath));
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walkDir('components');
files.push('App.tsx');
const colorCounts = {};

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const matches = content.match(/(bg|text|border|ring|shadow)-[a-z]+-[1-9]00/g) || [];
  matches.forEach(m => {
    colorCounts[m] = (colorCounts[m] || 0) + 1;
  });
});

const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log(sorted);
