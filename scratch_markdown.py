import json

data_path = '/Users/hunterwright/Projects/Residency-Optimizer/Docs/resident_subspecialty_data.json'
with open(data_path, 'r') as f:
    data = json.load(f)

# The graduation requirements
required_experiences = {
    'IM CARDS': 'Cardiology',
    'IM ENDO': 'Endocrinology',
    'IM GI': 'Gastroenterology',
    'IM HEME': 'Hematology-Oncology', # Or IM ONC
    'IM ONC': 'Hematology-Oncology',
    'IM ID': 'Infectious Disease',
    'IM NEPH': 'Nephrology',
    'IM PULM': 'Pulmonology',
    'IM RHEUM': 'Rheumatology',
    'IM NEURO': 'Neurology',
    'EM-MHSA': 'Emergency Medicine',
    'IM GERI': 'Geriatrics',
    'IM HPC': 'Hospice & Palliative',
    'IM ADDICTION': 'Addiction Medicine'
}

excluded_residents = ["Wright, Andrew Hunter", "Melo, Sebastian", "Mysore, Nishad Narain"]

markdown_content = "# Resident Graduation Audit (Class of 2027 & 2028)\n\n"
markdown_content += "This document tracks the completed subspecialty and multidisciplinary requirements for all active residents to accurately map their missing needs for the 2026-2027 optimizer schedules.\n\n"

markdown_content += "## 4-Week Pulmonology Completions\n"
markdown_content += "The following active residents have completed 4 full weeks of IM PULM:\n"

pulm_4w_list = []
for resident, info in data.items():
    if resident in excluded_residents:
        continue
    for comp in info['Completed']:
        if 'IM PULM' in comp:
            weeks = int(comp.split('(')[1].split('w)')[0])
            if weeks >= 4:
                pulm_4w_list.append(resident)

if pulm_4w_list:
    for name in pulm_4w_list:
        markdown_content += f"- {name}\n"
else:
    markdown_content += "- None found.\n"

markdown_content += "\n## Comprehensive Resident Audit\n\n"

for resident, info in sorted(data.items()):
    if resident in excluded_residents:
        continue

    markdown_content += f"### {resident} (Status: {info['Status']})\n"
    markdown_content += "**Completed Rotations:**\n"

    completed_keys = []
    if len(info['Completed']) == 0:
        markdown_content += "- None logged.\n"
    else:
        for comp in info['Completed']:
            markdown_content += f"- {comp}\n"
            # Attempt to parse target
            for r_key in required_experiences.keys():
                if r_key in comp:
                    completed_keys.append(r_key)

    # Heme and Onc are paired. If they have either, mark hematology-oncology complete
    if 'IM HEME' in completed_keys or 'IM ONC' in completed_keys:
        completed_keys.append('IM HEME')
        completed_keys.append('IM ONC')

    missing = []
    # Deduplicate required logic
    requirements_tally = {
        'Cardiology': False,
        'Endocrinology': False,
        'Gastroenterology': False,
        'Hematology-Oncology': False,
        'Infectious Disease': False,
        'Nephrology': False,
        'Pulmonology': False,
        'Rheumatology': False,
        'Neurology': False,
        'Emergency Medicine': False,
        'Geriatrics': False,
        'Hospice & Palliative': False,
        'Addiction Medicine': False
    }

    for comp in completed_keys:
        if comp in required_experiences:
            requirements_tally[required_experiences[comp]] = True

    for req, is_met in requirements_tally.items():
        if not is_met:
            missing.append(req)

    markdown_content += "\n**Remaining Needs Before Graduation:**\n"
    if not missing:
        markdown_content += "- ALL REQUIREMENTS MET.\n"
    else:
        for m in missing:
            markdown_content += f"- [ ] {m}\n"
    markdown_content += "\n---\n\n"

with open('/Users/hunterwright/.gemini/antigravity/brain/972394c3-9f3f-4d36-a303-960ef68f0682/resident_graduation_audit.md', 'w') as f:
    f.write(markdown_content)

print("Markdown generated!")
