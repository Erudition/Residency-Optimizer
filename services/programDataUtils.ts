/**
 * Utility functions that derive rotation categories from ProgramData at runtime.
 * Replaces the hardcoded CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, etc.
 */

import type { ProgramData } from './api/client'

/**
 * Derives the latest historical (finalized) academic year from the current date.
 * Returns the starting calendar year of the academic year (e.g., AY 2025-26 → 2025).
 * Academic years start in July, so:
 * - July 2025 onwards → 2025 (AY 2025-26)
 * - Before July 2026 → 2025 (still AY 2025-26)
 * - July 2026 onwards → 2026 (AY 2026-27)
 */
export function deriveLatestHistoricalYear(): number {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

/** All rotation codenames known to the program. */
export function getAllCodenames(programData: ProgramData): string[] {
  return Array.from(programData.rotations.keys())
}

/** Codenames tagged with a given tag title (e.g. 'Clinic', 'Elective'). */
export function getCodenamesByTag(programData: ProgramData, tag: string): string[] {
  return getAllCodenames(programData).filter(
    codename => programData.rotationTags.get(codename)?.includes(tag)
  )
}

/** Check if a rotation belongs to a given tag category. */
export function hasTag(programData: ProgramData, codename: string, tag: string): boolean {
  return programData.rotationTags.get(codename)?.includes(tag) ?? false
}

/** Clinic rotations (both specific sites and placeholder). */
export function isClinicRotation(programData: ProgramData, codename: string): boolean {
  return hasTag(programData, codename, 'Clinic') || hasTag(programData, codename, 'Continuity Clinic')
}

/** Get the clinic codenames (e.g. ['CCIM', 'NIMA', 'CLINIC']). */
export function getClinicCodenames(programData: ProgramData): string[] {
  return getCodenamesByTag(programData, 'Clinic')
}

/** Get a sorted list of all codenames for display.
 * Sort order:
 * 1. Core rotations (with staffing minimums) first
 * 2. Within each group, by intensity descending
 * 3. Vacation and placeholder electives last
 * 4. Alphabetical by label as final tiebreaker
 */
export function getDisplayOrderedCodenames(programData: ProgramData): string[] {
  return getAllCodenames(programData).sort((a, b) => {
    const ra = programData.rotations.get(a)
    const rb = programData.rotations.get(b)
    if (!ra || !rb) return 0

    // Vacation always last
    if (a === 'VAC') return 1
    if (b === 'VAC') return -1

    // Placeholder elective second-to-last
    if (a === 'ELEC') return 1
    if (b === 'ELEC') return -1

    // Core rotations (those with any staffing minimum) sort first
    const aHasMin = (ra.minInterns > 0 || ra.minSeniors > 0) ? 1 : 0
    const bHasMin = (rb.minInterns > 0 || rb.minSeniors > 0) ? 1 : 0
    if (aHasMin !== bHasMin) return bHasMin - aHasMin

    // Then by intensity descending
    if ((rb.intensity ?? 0) !== (ra.intensity ?? 0)) {
      return (rb.intensity ?? 0) - (ra.intensity ?? 0)
    }

    // Then alphabetically by label
    return (ra.label || a).localeCompare(rb.label || b)
  })
}
