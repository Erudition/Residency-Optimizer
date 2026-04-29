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

const colorMap = {
    // Slate -> Light grays
    'bg-slate-50': 'bg-light-1',
    'bg-slate-100': 'bg-light-2',
    'bg-slate-200': 'bg-light-3',
    'bg-slate-300': 'bg-light-4',
    'text-slate-400': 'text-muted',
    'text-slate-500': 'text-muted',
    'text-slate-600': 'text-secondary',
    'text-slate-700': 'text-primary',
    'text-slate-800': 'text-primary',
    'text-slate-900': 'text-black',
    'border-slate-100': 'border-light-3',
    'border-slate-200': 'border-light-5',
    'border-slate-300': 'border-light-6',
    
    // Gray -> Light grays
    'bg-gray-50': 'bg-light-1',
    'bg-gray-100': 'bg-light-2',
    'bg-gray-200': 'bg-light-3',
    'bg-gray-300': 'bg-light-4',
    'bg-gray-500': 'bg-light-6',
    'bg-gray-700': 'bg-light-9',
    'bg-gray-900': 'bg-black',
    'text-gray-300': 'text-light-5',
    'text-gray-400': 'text-muted',
    'text-gray-500': 'text-muted',
    'text-gray-600': 'text-secondary',
    'text-gray-700': 'text-primary',
    'text-gray-800': 'text-primary',
    'text-gray-900': 'text-black',
    'border-gray-100': 'border-light-3',
    'border-gray-200': 'border-light-5',
    'border-gray-300': 'border-light-6',
    'border-gray-700': 'border-light-9',

    // Blues
    'bg-blue-50': 'bg-light-blue/20',
    'bg-blue-100': 'bg-light-blue/40',
    'bg-blue-200': 'bg-light-blue',
    'bg-blue-400': 'bg-blue-2',
    'bg-blue-500': 'bg-blue',
    'bg-blue-600': 'bg-blue',
    'bg-blue-700': 'bg-blue-2-dark',
    'text-blue-500': 'text-blue',
    'text-blue-600': 'text-blue',
    'text-blue-700': 'text-blue-2-dark',
    'text-blue-800': 'text-navy',
    'text-blue-900': 'text-navy-dark',
    'border-blue-100': 'border-light-blue/40',
    'border-blue-200': 'border-light-blue',
    'border-blue-300': 'border-blue-2',
    'border-blue-500': 'border-blue',
    'border-blue-600': 'border-blue',
    'ring-blue-500': 'ring-blue',

    // Greens (Emerald/Green/Lime)
    'bg-green-50': 'bg-lime-green/20',
    'bg-green-100': 'bg-lime-green/40',
    'bg-green-200': 'bg-lime-green',
    'bg-green-500': 'bg-green-2',
    'bg-green-600': 'bg-green',
    'bg-emerald-50': 'bg-lime-green/20',
    'bg-emerald-200': 'bg-lime-green',
    'bg-emerald-500': 'bg-green-2',
    'bg-emerald-600': 'bg-green',
    'text-green-500': 'text-green-2',
    'text-green-600': 'text-green',
    'text-green-700': 'text-green-dark',
    'text-green-800': 'text-green-dark',
    'text-green-900': 'text-green-dark',
    'text-emerald-600': 'text-green',
    'text-emerald-900': 'text-green-dark',
    'border-green-100': 'border-lime-green/40',
    'border-green-200': 'border-lime-green',
    'border-emerald-300': 'border-green-2',

    // Reds / Roses / Oranges
    'bg-red-50': 'bg-red/10',
    'bg-red-100': 'bg-red/20',
    'bg-red-200': 'bg-red/40',
    'bg-red-500': 'bg-red-2',
    'bg-red-600': 'bg-red',
    'text-red-400': 'text-red-2',
    'text-red-500': 'text-red',
    'text-red-600': 'text-red-2-dark',
    'text-red-700': 'text-red-2-dark',
    'text-red-900': 'text-red-2-dark',
    'border-red-100': 'border-red/20',
    'border-red-200': 'border-red/40',
    'border-red-300': 'border-red-2',
    'border-red-500': 'border-red',

    // Ambers / Yellows / Oranges
    'bg-amber-50': 'bg-light-yellow/30',
    'bg-amber-300': 'bg-light-yellow',
    'bg-amber-500': 'bg-yellow',
    'bg-yellow-100': 'bg-light-yellow/30',
    'bg-yellow-200': 'bg-light-yellow',
    'bg-orange-50': 'bg-creamsicle/30',
    'bg-orange-100': 'bg-creamsicle/50',
    'bg-orange-200': 'bg-creamsicle',
    'text-amber-500': 'text-yellow',
    'text-amber-800': 'text-light-yellow-dark',
    'text-amber-900': 'text-light-yellow-dark',
    'text-yellow-800': 'text-light-yellow-dark',
    'text-yellow-900': 'text-light-yellow-dark',
    'text-orange-600': 'text-orange',
    'text-orange-800': 'text-orange-dark',
    'text-orange-900': 'text-orange-dark',
    'border-amber-400': 'border-yellow',
    'border-yellow-200': 'border-light-yellow',
    'border-yellow-300': 'border-yellow',
    'border-orange-200': 'border-creamsicle',
    'border-orange-300': 'border-orange',

    // Purples / Indigos / Fuchsias
    'bg-purple-50': 'bg-light-purple/30',
    'bg-purple-100': 'bg-light-purple/50',
    'bg-purple-200': 'bg-light-purple',
    'bg-purple-500': 'bg-purple',
    'bg-indigo-50': 'bg-light-purple/30',
    'bg-indigo-100': 'bg-light-purple/50',
    'bg-indigo-200': 'bg-light-purple',
    'bg-indigo-500': 'bg-purple',
    'bg-fuchsia-500': 'bg-fuchsia',
    'text-purple-600': 'text-purple',
    'text-purple-800': 'text-purple-2',
    'text-purple-900': 'text-purple-2-dark',
    'text-indigo-600': 'text-purple',
    'text-indigo-800': 'text-purple-2',
    'text-indigo-900': 'text-purple-2-dark',
    'border-purple-300': 'border-purple',
    'border-indigo-200': 'border-light-purple',
    'border-indigo-300': 'border-purple',
};

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  let changed = false;

  for (const [oldClass, newClass] of Object.entries(colorMap)) {
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    if (regex.test(content)) {
        content = content.replace(regex, newClass);
        changed = true;
    }
  }

  // Also replace empty or missing variants in buttons if applicable
  // Just let the UI components handle defaults.

  if (changed) {
    fs.writeFileSync(f, content);
  }
});

console.log("Applied comprehensive theme colors");
