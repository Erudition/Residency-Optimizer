const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let code = fs.readFileSync(filePath, 'utf8');

    // Check if we need to add imports
    let needsButton = /<button/i.test(code);
    let needsInput = /<input/i.test(code);
    let needsSelect = /<select/i.test(code);
    let needsBadge = /bg-(green|blue|red|yellow)-[15]00/i.test(code); // just an approximation for Badge

    // Apply structural component replacements
    // Replace buttons
    code = code.replace(/<button([^>]*)className="([^"]*bg-blue-600[^"]*)"([^>]*)>/g, '<Button variant="primary" size="md" $1 className="$2" $3>');
    code = code.replace(/<button([^>]*)className="([^"]*bg-emerald-600[^"]*)"([^>]*)>/g, '<Button variant="primary" size="md" $1 className="$2" $3>');
    code = code.replace(/<button([^>]*)className="([^"]*bg-gray-100[^"]*)"([^>]*)>/g, '<Button variant="secondary" size="md" $1 className="$2" $3>');
    code = code.replace(/<button([^>]*)className="([^"]*text-red-600[^"]*)"([^>]*)>/g, '<Button variant="danger" size="md" $1 className="$2" $3>');
    code = code.replace(/<button/g, '<Button');
    code = code.replace(/<\/button>/g, '</Button>');

    // Replace inputs and selects
    code = code.replace(/<input([^>]*)className="([^"]*border[^"]*)"/g, '<Input $1 className="$2"');
    code = code.replace(/<select([^>]*)className="([^"]*border[^"]*)"/g, '<Select $1 className="$2"');
    code = code.replace(/<\/select>/g, '</Select>');

    // Map old generic tailwind colors to posthog theme colors
    const colorMap = {
        'bg-white': 'bg-white',
        'bg-gray-50': 'bg-light-1',
        'bg-gray-100': 'bg-light-2',
        'bg-gray-200': 'bg-light-3',
        'bg-blue-50': 'bg-light-blue/20',
        'bg-blue-100': 'bg-light-blue',
        'bg-blue-600': 'bg-blue',
        'text-blue-600': 'text-blue',
        'text-gray-900': 'text-black',
        'text-gray-800': 'text-primary',
        'text-gray-700': 'text-primary',
        'text-gray-600': 'text-secondary',
        'text-gray-500': 'text-muted',
        'text-gray-400': 'text-muted',
        'border-gray-100': 'border-light-3',
        'border-gray-200': 'border-light-5',
        'border-gray-300': 'border-light-6',
        'border-blue-500': 'border-blue',
        'border-blue-600': 'border-blue',
        'bg-indigo-50': 'bg-light-purple/30',
        'text-indigo-600': 'text-purple-2',
        'bg-red-50': 'bg-red/10',
        'text-red-600': 'text-red',
        'bg-emerald-50': 'bg-green/10',
        'text-emerald-600': 'text-green',
        'bg-emerald-600': 'bg-green',
        'bg-amber-50': 'bg-highlight',
        'text-amber-800': 'text-orange-dark',
        'text-amber-500': 'text-orange',
    };

    for (const [oldClass, newClass] of Object.entries(colorMap)) {
        const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
        code = code.replace(regex, newClass);
    }

    if (needsButton || needsInput || needsSelect) {
        let imports = [];
        let importDepth = filePath === 'App.tsx' ? './components/ui' : './ui';

        if (needsButton && !code.includes('import { Button }')) imports.push(`import { Button } from '${importDepth}/Button';`);
        if (needsInput && !code.includes('import { Input }')) imports.push(`import { Input } from '${importDepth}/Input';`);
        if (needsSelect && !code.includes('import { Select }')) imports.push(`import { Select } from '${importDepth}/Select';`);

        if (imports.length > 0) {
            const importMatches = [...code.matchAll(/^import .*?;/gm)];
            if (importMatches.length > 0) {
                const lastMatch = importMatches[importMatches.length - 1];
                const insertPos = lastMatch.index + lastMatch[0].length;
                code = code.slice(0, insertPos) + '\n' + imports.join('\n') + code.slice(insertPos);
            }
        }
    }

    fs.writeFileSync(filePath, code);
}

const components = [
    'App.tsx',
    'components/DataManagement.tsx',
    'components/ScheduleComparison.tsx',
    'components/CompetitorStudio.tsx',
    'components/Dashboard.tsx',
    'components/AssignmentStats.tsx',
    'components/FairnessStats.tsx',
    'components/RequirementsStats.tsx',
    'components/RelationshipStats.tsx',
    'components/ACGMEAudit.tsx',
    'components/ScheduleTable.tsx'
];

components.forEach(replaceInFile);
console.log("Refactored components");
