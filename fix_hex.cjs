const fs = require('fs');

let content = fs.readFileSync('constants.ts', 'utf8');

const hexMap = {
    '#fca5a5': '#DF6133', // red
    '#93c5fd': '#2F80FA', // blue
    '#d8b4fe': '#B62AD9', // purple
    '#a5b4fc': '#8567FF', // lilac
    '#fdba74': '#EB9D2A', // orange
    '#fde047': '#F7A501', // yellow
    '#86efac': '#6AA84F', // green
    '#e5e7eb': '#D2D3CC', // light-4
    '#5eead4': '#29DBBB', // teal
    '#fda4af': '#E34C6F', // pink
    '#bef264': '#96E5B6', // lime
    '#fcd34d': '#FFBA53', // gold
    '#67e8f9': '#30ABC6', // seagreen
    '#e879f9': '#A621C8', // fuchsia
    '#f9a8d4': '#E34C6F', // pink
    '#a78bfa': '#8567FF', // lilac
    '#6ee7b7': '#36C46F', // green-2
    '#fbbf24': '#EB9D2A', // orange
    '#d6d3d1': '#BFC1B7', // light-6
    '#ffedd5': '#FFD699', // creamsicle
    '#cbd5e1': '#BFC1B7', // light-6
    '#bae6fd': '#9FC4FF', // light-blue
    '#fef08a': '#FFCE5C', // light-yellow
    '#e2e8f0': '#D2D3CC', // light-4
    '#fce7f3': '#E2D6FF', // light-purple
    '#fee2e2': '#F87A4C', // red-2
    '#fecdd3': '#E34C6F', // pink
    '#99f6e4': '#6BC0B3', // teal-2
    '#c7d2fe': '#9FC4FF', // light-blue
};

for (const [oldHex, newHex] of Object.entries(hexMap)) {
    const regex = new RegExp(oldHex, 'gi');
    content = content.replace(regex, newHex);
}

fs.writeFileSync('constants.ts', content);
console.log('Fixed hex colors in constants.ts');