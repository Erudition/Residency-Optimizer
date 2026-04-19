import re
import json

files = ['/Users/hunterwright/Projects/Residency-Optimizer/Docs/2024-2025 academic years.xls', 
         '/Users/hunterwright/Projects/Residency-Optimizer/Docs/2025-2026 academic years.xls']

resident_history = {}
# Mapping subspecialties based on standard New Innovations tags
target_rotations = ['IM PULM', 'IM NEPH', 'IM CARDS', 'IM ID', 'EM-MHSA', 'IM HEME', 'IM ONC', 'IM NEURO', 'IM GI', 'IM RHEUM', 'IM GERI', 'IM HPC', 'IM ADDICTION', 'IM ENDO']

import os

for f_path in files:
    if not os.path.exists(f_path):
        print(f"File not found: {f_path}")
        continue
    try:
        with open(f_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        rows = re.findall(r'<tr.*?>(.*?)</tr>', content, flags=re.IGNORECASE | re.DOTALL)
        for row in rows:
            cells = re.findall(r'<td.*?>(.*?)</td>', row, flags=re.IGNORECASE | re.DOTALL)
            if len(cells) > 2:
                name = cells[0].strip().replace('&nbsp;', '')
                if not name:
                    continue
                status = cells[1].strip()
                if 'Faculty' in status:
                    continue
                
                if name not in resident_history:
                    # Initialize their cohort tracker based on status if possible
                    # PGY level will advance over years, so we might just use their most recent status or capture it
                    resident_history[name] = {"rotations": {}, "status": status}
                
                for cell in cells[2:]:
                    rotation = cell.strip()
                    if not rotation or rotation == '&nbsp;':
                        continue
                    
                    for target in target_rotations:
                        if target in rotation or rotation in target:
                            resident_history[name]["rotations"][target] = resident_history[name]["rotations"].get(target, 0) + 1
    except Exception as e:
        print(f"Error parsing {f_path}: {e}")

out = {}
for name, data in resident_history.items():
    completed = []
    # Convert weekly counts into "Blocks" roughly (2+ weeks = completed split block or full block)
    for rot, weeks in data["rotations"].items():
        if weeks >= 2:
            completed.append(f"{rot} ({weeks}w)")
    
    if len(completed) > 0:
        out[name] = {"Status": data["status"], "Completed": completed}

with open('/Users/hunterwright/Projects/Residency-Optimizer/Docs/resident_subspecialty_data.json', 'w') as f:
    json.dump(out, f, indent=2)

print("JSON file created at /Users/hunterwright/Projects/Residency-Optimizer/Docs/resident_subspecialty_data.json")
