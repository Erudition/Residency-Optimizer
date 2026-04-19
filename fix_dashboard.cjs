const fs = require('fs');

let content = fs.readFileSync('components/Dashboard.tsx', 'utf8');

// Find all hex colors and replace them with mapping from ASSIGNMENT_HEX_COLORS
// Better: Just import ASSIGNMENT_HEX_COLORS and use it in the JSX!

// Add import
content = content.replace(/import \{ ASSIGNMENT_COLORS \} from '\.\.\/constants';/, "import { ASSIGNMENT_COLORS, ASSIGNMENT_HEX_COLORS } from '../constants';");

// Replace hardcoded fills
const barRegex = /<Bar dataKey=\{AssignmentType\.([A-Z_]+)\} stackId="a" fill="([^"]+)"/g;
content = content.replace(barRegex, '<Bar dataKey={AssignmentType.$1} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.$1]}');

fs.writeFileSync('components/Dashboard.tsx', content);
console.log('Updated Dashboard.tsx to use ASSIGNMENT_HEX_COLORS');
