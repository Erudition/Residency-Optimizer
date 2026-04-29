from weasyprint import HTML

try:
    HTML('Docs/MHS_Curriculum_Proposal.html').write_pdf('Docs/MHS_Curriculum_Proposal.pdf')
    print("PDF generated successfully.")
except Exception as e:
    print(f"Error generating PDF: {e}")
