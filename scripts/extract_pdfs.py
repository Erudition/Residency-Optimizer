import pypdf
import os

files = [
    "reference-material/MHS  Internal Medicine Policy and Procedure 2025-2026_Progressive Autonomy.pdf",
    "reference-material/AY26-27 RESIDENT TIME AWAY REQUEST FORM.pdf"
]

for f_name in files:
    if os.path.exists(f_name):
        print(f"\n========== {f_name} ==========\n")
        try:
            reader = pypdf.PdfReader(f_name)
            for page in reader.pages:
                print(page.extract_text())
        except Exception as e:
            print(f"Error reading {f_name}: {e}")
