
# Rotation Features & Intensity Tracking

This document outlines the characteristics of each assignment type available in the Residency Scheduler Pro system.

## Classification Legend

*   **Category**:
    *   **Core**: Fundamental rotations required for graduation and major staffing blocks.
    *   **Required Elective**: Rotations that must be completed by specific PGY levels.
    *   **Voluntary Elective**: Optional rotations available to fill gaps.
    *   **Other**: Non-clinical or administrative time.
*   **Setting**:
    *   **Inpatient**: Hospital-based service.
    *   **Outpatient**: Clinic or ambulatory setting.
    *   **Mix**: Combination of both.
*   **Intensity Score (1-5)**:
    *   **5**: Highest intensity (e.g., ICU, Metro)
    *   **4**: High intensity (e.g., Wards Red, Night Float).
    *   **3**: Moderate-High intensity (e.g., Wards Blue, EM, Met Wards).
    *   **2**: Moderate intensity (e.g., Clinic).
    *   **1**: Standard intensity (Electives, Specialty Electives).

## Assignment Table

| Assignment Code | Full Name | Category | Setting | Intensity Score | Max concurrent assignees |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ICU** | Intensive Care Unit | Core | Inpatient | 5 | 4 |
| **WARDS-R** | Wards Red | Core | Inpatient | 4 | 5 |
| **NF** | Night Float | Core | Inpatient | 4 | 5 |
| **WARDS-B** | Wards Blue | Core | Inpatient | 3 | 5 |
| **EM** | Emergency Medicine | Core | Inpatient | 3 | 4 |
| **CCIM** | Clinic | Core | **Outpatient** | 2 | 10 |
| **MET Wards** | Met Wards (Overflow) | Core/Voluntary | Inpatient | 3 | 5 |
| **CARDS** | Cardiology | Required Elective (PGY1) | Inpatient | 2 | 4 |
| **ID** | Infectious Disease | Required Elective (PGY1) | Inpatient | 1 | 4 |
| **NEPH** | Nephrology | Required Elective (PGY1) | Inpatient | 1 | 4 |
| **PULM** | Pulmonology | Required Elective (PGY1) | Inpatient | 1 | 4 |
| **ONC** | Hematology-Oncology | Required Elective (PGY2) | Inpatient | 1 | 2 |
| **NEURO** | Neurology | Required Elective (PGY2) | Inpatient | 1 | 2 |
| **RHEUM** | Rheumatology | Required Elective (PGY2) | **Outpatient** | 1 | 2 |
| **GI** | Gastroenterology | Required Elective (PGY2) | **Outpatient** | 1 | 2 |
| **ADD MED** | Addiction Medicine | Required Elective (PGY3) | Inpatient | 1 | 2 |
| **ENDO** | Endocrinology | Required Elective (PGY3) | **Outpatient** | 1 | 2 |
| **GERI** | Geriatrics | Required Elective (PGY3) | **Outpatient** | 1 | 2 |
| **HPC** | Palliative Care | Required Elective (PGY3) | Inpatient | 1 | 2 |
| **ENT** | Otolaryngology | Voluntary Elective | **Outpatient** | 1 | 2 |
| **METRO** | Metro ICU | Voluntary Elective | Inpatient | 5 | 6 |
| **CC-ICU** | Cardiac ICU | Voluntary Elective | Inpatient | 3 | 4 |
| **HF** | Heart Failure | Voluntary Elective | Inpatient | 1 | 4 |
| **CCMA** | CCMA | Voluntary Elective | Inpatient | 3 | 4 |
| **RESEARCH** | Research | Voluntary Elective | Inpatient | 1 | 10 |
| **ELECTIVE** | Generic Elective | Voluntary Elective | Inpatient | 1 | 20 |
| **VAC** | Vacation | Other | N/A | 0 | 20 |

## Configuration Notes

*   **Outpatient Assignments**: Defined strictly as CCIM, RHEUM, GI, ENDO, GERI, and ENT.
*   **Inpatient Assignments**: All other clinical assignments including ONC.
