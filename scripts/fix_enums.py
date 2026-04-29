import os, glob

REPLACEMENTS = {
    "AssignmentType.ICU": "AssignmentType.MICU",
    "AssignmentType.MET_WARDS": "AssignmentType.WARDS_METRO",
    "AssignmentType.METRO": "AssignmentType.METRO_ICU",
    "AssignmentType.CC_ICU": "AssignmentType.AMCS_CONSULTS",
    "AssignmentType.HPC": "AssignmentType.PALLIATIVE",
}

for filepath in glob.glob("**/*.tsx", recursive=True) + glob.glob("**/*.ts", recursive=True):
    if "node_modules" in filepath: continue
    
    with open(filepath, "r") as f:
        content = f.read()
        
    original = content
    for old, new in REPLACEMENTS.items():
        if old == "AssignmentType.METRO" and "AssignmentType.METRO_ICU" in content:
            # handle partial replace to prevent METRO_ICU_ICU
            content = content.replace("AssignmentType.METRO,", "AssignmentType.METRO_ICU,")
            content = content.replace("AssignmentType.METRO]", "AssignmentType.METRO_ICU]")
            content = content.replace("AssignmentType.METRO ", "AssignmentType.METRO_ICU ")
        else:
            content = content.replace(old, new)
            
    if original != content:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")
