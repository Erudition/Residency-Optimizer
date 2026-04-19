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

const redundantClasses = [
    'bg-blue', 'bg-blue-600', 'bg-blue-2-dark', 'bg-gray-100', 'bg-red-600', 'bg-emerald-600',
    'text-white', 'text-black', 'font-bold', 'rounded-xl', 'rounded-lg', 'rounded-md',
    'shadow-lg', 'shadow-md', 'shadow-blue-200', 'active:scale-95', 'px-8', 'py-3'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;

  // Fix toggles in CompetitorStudio.tsx
  if (f.endsWith('CompetitorStudio.tsx')) {
      content = content.replace(/<Button\s+onClick=\{\(\) => onToggleAlgorithm\(algo\.id\)\}/, '<button onClick={() => onToggleAlgorithm(algo.id)}');
      content = content.replace(/<\/Button>\s*<\/div>\s*\{\/\* Card Body \*\/\}/, '</button></div>{/* Card Body */}');
      changed = true;
  }

  // Cleanup Button classNames
  const buttonRegex = /<Button([^>]*)className="([^"]*)"/g;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
      let fullMatch = match[0];
      let props = match[1];
      let classes = match[2];
      
      let newClasses = classes;
      redundantClasses.forEach(c => {
          newClasses = newClasses.replace(new RegExp(`\\b${c}\\b`, 'g'), '').replace(/\s\s+/g, ' ').trim();
      });

      if (newClasses !== classes) {
          const newButton = `<Button${props}className="${newClasses}"`;
          content = content.replace(fullMatch, newButton);
          changed = true;
      }
  }

  if (changed) {
    fs.writeFileSync(f, content);
  }
});

console.log("Cleaned up redundant button classes and fixed toggles");
