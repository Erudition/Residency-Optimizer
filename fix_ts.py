import os
import glob
import re

# 1. Fix getYearRequirementCount calls
for filepath in glob.glob('services/generators/*.ts'):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # regex for getYearRequirementCount(newSchedule[a.id], req.type, 0, yearEnd)
    # -> getYearRequirementCount(newSchedule[a.id], req.type, 0, yearEnd, programData)
    # We will just replace all getYearRequirementCount(...) calls that only have 4 arguments
    # It's easier to just do string replacement
    # Actually, let's just use re.sub for getYearRequirementCount
    content = re.sub(r'getYearRequirementCount\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)', r'getYearRequirementCount(\1, \2, \3, \4, programData)', content)
    
    with open(filepath, 'w') as f:
        f.write(content)

# 2. Fix healer.ts
with open('services/healer.ts', 'r') as f:
    healer = f.read()
healer = healer.replace("import { REQUIREMENTS } from '../constants';", "")
with open('services/healer.ts', 'w') as f:
    f.write(healer)

# 3. Fix healerSolver.ts
with open('services/healerSolver.ts', 'r') as f:
    hs = f.read()
hs = hs.replace("import { RequirementsEngine } from '../requirementsEngine';", "import { RequirementsEngine } from './requirementsEngine';")
hs = hs.replace("REQUIREMENTS,", "")
with open('services/healerSolver.ts', 'w') as f:
    f.write(hs)

# 4. Fix scheduler.ts
with open('services/scheduler.ts', 'r') as f:
    sched = f.read()
sched = sched.replace("from './reqBuilder';", "from './generators/reqBuilder';")
sched = sched.replace("ROTATION_METADATA[c.assignment]", "programData.rotations.get(c.assignment as any)")
sched = sched.replace("ROTATION_METADATA[assign]", "programData.rotations.get(assign as any)")
with open('services/scheduler.ts', 'w') as f:
    f.write(sched)

