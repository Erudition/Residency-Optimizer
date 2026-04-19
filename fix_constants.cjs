const fs = require('fs');

let content = fs.readFileSync('constants.ts', 'utf8');

const colorMap = {
    'bg-red-100': 'bg-red/20',
    'bg-red-200': 'bg-red/40',
    'text-red-800': 'text-red-2-dark',
    'text-red-900': 'text-red-2-dark',
    'border-red-200': 'border-red/40',
    'border-red-300': 'border-red-2',
    
    'bg-blue-200': 'bg-light-blue',
    'text-blue-900': 'text-navy-dark',
    'border-blue-300': 'border-blue-2',
    
    'bg-purple-100': 'bg-light-purple/50',
    'bg-purple-200': 'bg-light-purple',
    'text-purple-800': 'text-purple-2',
    'text-purple-900': 'text-purple-2-dark',
    'border-purple-200': 'border-purple',
    'border-purple-300': 'border-purple',

    'bg-indigo-100': 'bg-light-purple/50',
    'bg-indigo-200': 'bg-light-purple',
    'text-indigo-800': 'text-purple-2',
    'text-indigo-900': 'text-purple-2-dark',
    'border-indigo-200': 'border-light-purple',
    'border-indigo-300': 'border-purple',

    'bg-orange-100': 'bg-creamsicle/50',
    'bg-orange-200': 'bg-creamsicle',
    'text-orange-800': 'text-orange-dark',
    'text-orange-900': 'text-orange-dark',
    'border-orange-200': 'border-creamsicle',
    'border-orange-300': 'border-orange',

    'bg-yellow-100': 'bg-light-yellow/30',
    'bg-yellow-200': 'bg-light-yellow',
    'text-yellow-800': 'text-light-yellow-dark',
    'text-yellow-900': 'text-light-yellow-dark',
    'border-yellow-200': 'border-light-yellow',
    'border-yellow-300': 'border-yellow',

    'bg-green-100': 'bg-lime-green/40',
    'text-green-800': 'text-green-dark',
    'border-green-200': 'border-lime-green',

    'bg-gray-100': 'bg-light-2',
    'text-gray-400': 'text-muted',
    'border-gray-200': 'border-light-5',

    'bg-teal-100': 'bg-teal-2/30',
    'bg-teal-200': 'bg-teal-2/50',
    'text-teal-800': 'text-teal-2-dark',
    'text-teal-900': 'text-teal-2-dark',
    'border-teal-200': 'border-teal-2',
    'border-teal-300': 'border-teal-2',

    'bg-rose-200': 'bg-pink/40',
    'bg-rose-300': 'bg-pink/60',
    'text-rose-900': 'text-pink-dark',
    'border-rose-300': 'border-pink',
    'border-rose-400': 'border-pink',

    'bg-lime-200': 'bg-lime-green',
    'text-lime-900': 'text-green-dark',
    'border-lime-300': 'border-lime-green',

    'bg-amber-200': 'bg-light-yellow',
    'bg-amber-300': 'bg-light-yellow',
    'text-amber-900': 'text-light-yellow-dark',
    'border-amber-300': 'border-yellow',
    'border-amber-400': 'border-yellow',

    'bg-cyan-200': 'bg-sky-blue/50',
    'text-cyan-900': 'text-sky-blue',
    'border-cyan-300': 'border-sky-blue',

    'bg-pink-300': 'bg-pink/60',
    'text-pink-900': 'text-pink-dark',
    'border-pink-400': 'border-pink',

    'bg-violet-300': 'bg-light-purple/80',
    'text-violet-900': 'text-purple-2-dark',
    'border-violet-400': 'border-purple',

    'bg-emerald-200': 'bg-lime-green',
    'text-emerald-900': 'text-green-dark',
    'border-emerald-300': 'border-green-2',

    'bg-stone-300': 'bg-light-4',
    'text-stone-900': 'text-black',
    'border-stone-400': 'border-light-6',

    'bg-slate-300': 'bg-light-4',
    'text-slate-900': 'text-black',
    'border-slate-400': 'border-light-6',

    'bg-sky-200': 'bg-pale-blue',
    'text-sky-900': 'text-pale-blue-dark',
    'border-sky-300': 'border-pale-blue-dark',

    'bg-fuchsia-200': 'bg-light-purple',
    'text-fuchsia-900': 'text-fuchsia-dark',
    'border-fuchsia-300': 'border-fuchsia',

    'bg-zinc-200': 'bg-light-3',
    'text-zinc-900': 'text-black',
    'border-zinc-300': 'border-light-5'
};

for (const [oldClass, newClass] of Object.entries(colorMap)) {
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    content = content.replace(regex, newClass);
}

fs.writeFileSync('constants.ts', content);
console.log('Fixed constants.ts');