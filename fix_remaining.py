import os
import glob
import re

# 1. Fix App.tsx
with open('App.tsx', 'r') as f:
    app = f.read()
app = app.replace("calculateFairnessMetrics(activeResidents, currentGrid)", "calculateFairnessMetrics(activeResidents, currentGrid, programData)")
with open('App.tsx', 'w') as f:
    f.write(app)

# 2. Fix components/FairnessStats.tsx
with open('components/FairnessStats.tsx', 'r') as f:
    fs = f.read()
fs = fs.replace("calculateFairnessMetrics(residents, schedule)", "calculateFairnessMetrics(residents, schedule, programData)")
if "import { useProgramData } from '../contexts/ProgramDataContext';" not in fs:
    fs = fs.replace("import React", "import React\nimport { useProgramData } from '../contexts/ProgramDataContext';")
    fs = fs.replace("const FairnessStats: React.FC<Props> = ({ residents, schedule }) => {", "const FairnessStats: React.FC<Props> = ({ residents, schedule }) => {\n  const programData = useProgramData();")
    fs = fs.replace("const FairnessStats: React.FC<Props> = React.memo(({ residents, schedule }) => {", "const FairnessStats: React.FC<Props> = React.memo(({ residents, schedule }) => {\n  const programData = useProgramData();")
with open('components/FairnessStats.tsx', 'w') as f:
    f.write(fs)

# 3. Fix components/ScheduleComparison.tsx
with open('components/ScheduleComparison.tsx', 'r') as f:
    sc = f.read()
sc = sc.replace("calculateFairnessMetrics(residents, yearGrid)", "calculateFairnessMetrics(residents, yearGrid, programData)")
sc = sc.replace("calculateDetailedScheduleScore(residents, yearGrid, history)", "calculateDetailedScheduleScore(residents, yearGrid, history, programData)")
if "import { useProgramData } from '../contexts/ProgramDataContext';" not in sc:
    sc = sc.replace("import React", "import React\nimport { useProgramData } from '../contexts/ProgramDataContext';")
    sc = re.sub(r'const ScheduleComparison: React\.FC<Props> = \(\{\s*results\s*\}\) => \{', r'const ScheduleComparison: React.FC<Props> = ({ results }) => {\n  const programData = useProgramData();', sc)
with open('components/ScheduleComparison.tsx', 'w') as f:
    f.write(sc)

# 4. Fix scheduler.ts
with open('services/scheduler.ts', 'r') as f:
    sched = f.read()
sched = sched.replace("historicalSchedules || {}", "history || {}")
with open('services/scheduler.ts', 'w') as f:
    f.write(sched)

# 5. Fix scheduler.worker.ts
with open('services/scheduler.worker.ts', 'r') as f:
    worker = f.read()
worker = worker.replace("getAuditViolations(yrResidents, fullHistory, y)", "getAuditViolations(yrResidents, fullHistory, programData, y)")
worker = worker.replace("getAuditViolations(residents, fullHistory, startYear)", "getAuditViolations(residents, fullHistory, programData, startYear)")
with open('services/scheduler.worker.ts', 'w') as f:
    f.write(worker)

