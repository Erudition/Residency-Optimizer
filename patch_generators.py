import os
import re

files_to_patch = [
    'services/generators/educationFirst.ts',
    'services/generators/staffingFirst.ts',
    'services/generators/stochastic.ts',
    'services/generators/weekByWeek.ts',
    'services/healer.ts',
    'services/healerSolver.ts',
    'services/scheduler.ts'
]

for filepath in files_to_patch:
    if not os.path.exists(filepath):
        continue
        
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Add RequirementsEngine import if missing
    if 'RequirementsEngine' not in content:
        # insert after first import
        content = re.sub(r'^(import .*?\n)', r'\1import { RequirementsEngine } from \'../requirementsEngine\';\n', content, count=1)
        
    # 2. Fix constants import (remove missing members)
    content = re.sub(r'ROTATION_METADATA,\s*', '', content)
    content = re.sub(r'REQUIREMENTS,\s*', '', content)
    content = re.sub(r'fulfillsRequirement,\s*', '', content)
    
    # 3. Replace fulfillsRequirement calls
    content = re.sub(r'fulfillsRequirement\(([^,]+),\s*([^)]+)\)', r'RequirementsEngine.fulfills(\1, \2, programData)', content)
    
    # 4. Replace REQUIREMENTS with buildLevelRequirements
    if 'REQUIREMENTS' in content:
        if 'buildLevelRequirements' not in content:
            content = content.replace("import type { ProgramData }", "import { buildLevelRequirements } from './reqBuilder';\nimport type { ProgramData }")
        content = re.sub(r'REQUIREMENTS\[([^\]]+)\]', r'buildLevelRequirements(programData, \1 as any)', content)
    
    with open(filepath, 'w') as f:
        f.write(content)
