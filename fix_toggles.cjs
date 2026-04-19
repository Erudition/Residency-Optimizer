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

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;

  // Find <Button where it is used as a toggle (has a condition on bg- or text-)
  // Or just generally where variant is missing but it looks like a toggle.
  
  // Pattern: <Button ... className={`... ${isActive ? 'bg-white...' : '...'}`}
  // We should add variant="ghost" to these.
  
  const toggleRegex = /<Button([^>]*className=\{`[^`]*\?)/g;
  if (toggleRegex.test(content)) {
      content = content.replace(/<Button([^>]*className=\{`[^`]*\?)/g, (match, p1) => {
          if (!p1.includes('variant=')) {
              return `<Button variant="ghost"${p1}`;
          }
          return match;
      });
      changed = true;
  }

  if (changed) {
    fs.writeFileSync(f, content);
  }
});

console.log("Fixed toggle buttons to use ghost variant");
