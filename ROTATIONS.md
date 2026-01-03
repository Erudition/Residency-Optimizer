
# Rotation Features & Intensity Tracking

This document outlines the characteristics of each assignment type available in the Residency Scheduler Pro system.

## Classification Legend

*   **Category**:
    *   **Core**: Fundamental rotations required for graduation and major staffing blocks.
    *   **Required Elective**: Rotations that must be completed by specific PGY levels (Interns, PGY2, PGY3).
    *   **Voluntary Elective**: Optional rotations available to fill gaps or for specific interest.
    *   **Other**: Non-clinical or administrative time.
*   **Setting**:
    *   **Inpatient**: Hospital-based service.
    *   **Outpatient**: Clinic or ambulatory setting.
    *   **Mix**: Combination of both.
    *   *(Note: Per configuration, all rotations not explicitly listed as Outpatient or Mix are classified as Inpatient).*
*   **Intensity Score (1-5)**:
    *   **5**: Highest intensity (e.g., ICU)
    *   **4**: Highest intensity (e.g., Wards Red, Night Float).
    *   **3**: High intensity (e.g., EM, MET Wards).
    *   **2**: Moderate intensity (e.g., Wards Blue).
    *   **1**: Standard intensity (Electives, Clinic, etc.).

## Assignment Table

| Assignment Code | Full Name | Category | Setting | Intensity Score | Max concurrent assignees |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ICU** | Intensive Care Unit | Core | Inpatient | 5 | 5 |
| **WARDS-R** | Wards Red | Core | Inpatient | 4 | 6 |
| **NF** | Night Float | Core | Inpatient | 4 | 4 |
| **WARDS-B** | Wards Blue | Core | Inpatient | 3 | 6 |
| **EM** | Emergency Medicine | Core | Inpatient | 2 | 3 |
| **CCIM** | Clinic | Core | **Outpatient** | 2 | 9 |
| **MET Wards** | Met Wards (Overflow) | Core/Voluntary | Inpatient | 3 | 5 |
| **CARDS** | Cardiology | Required Elective (PGY1) | Inpatient | 2 | 2 |
| **ID** | Infectious Disease | Required Elective (PGY1) | Inpatient | 1 | 2 |
| **NEPH** | Nephrology | Required Elective (PGY1) | Inpatient | 1 | 2 |
| **PULM** | Pulmonology | Required Elective (PGY1) | Inpatient | 1 | 2 |
| **ONC** | Hematology-Oncology | Required Elective (PGY2) | **Mix** | 1 | 1 |
| **NEURO** | Neurology | Required Elective (PGY2) | Inpatient | 1 | 2 |
| **RHEUM** | Rheumatology | Required Elective (PGY2) | **Outpatient** | 1 | 1 |
| **GI** | Gastroenterology | Required Elective (PGY2) | **Outpatient** | 1 | 2 |
| **ADD MED** | Addiction Medicine | Required Elective (PGY3) | Inpatient | 1 | 1 |
| **ENDO** | Endocrinology | Required Elective (PGY3) | **Outpatient** | 1 | 1 |
| **GERI** | Geriatrics | Required Elective (PGY3) | **Outpatient** | 1 | 1 |
| **HPC** | Palliative Care | Required Elective (PGY3) | Inpatient | 1 | 1 |
| **ENT** | Otolaryngology | Voluntary Elective | **Outpatient** | 1 | 1 |
| **METRO** | Metro ICU | Voluntary Elective | Inpatient | 5 | 3 |
| **CC-ICU** | Cardiac ICU | Voluntary Elective | Inpatient | 3 | 2 |
| **HF** | Heart Failure | Voluntary Elective | Inpatient | 1 | 2 |
| **CCMA** | CCMA | Voluntary Elective | Inpatient | 3 | 2 |
| **RESEARCH** | Research | Voluntary Elective | Inpatient | 1 | * |
| **ELECTIVE** | Generic Elective | Voluntary Elective | Inpatient | 1 | * |
| **VAC** | Vacation | Other | N/A | 0 | * |

## Configuration Notes

*   **Outpatient Assignments**: Defined strictly as CCIM, RHEUM, ENDO, GERI, and ENT.
*   **Mixed Assignments**: Defined strictly as ONC.
*   **Inpatient Assignments**: All other clinical assignments.