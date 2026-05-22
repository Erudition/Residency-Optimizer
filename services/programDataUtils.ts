/**
 * Utility functions that derive rotation categories from ProgramData at runtime.
 * Replaces the hardcoded CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, etc.
 */

import type { ProgramData } from './api/client'

/**
 * Derives the active academic start year from the current date.
 * Academic years start in July, so if it's July or later, the start year is the current calendar year.
 * If it's before July, the start year is the previous calendar year.
 */
export function deriveActiveStartYear(): number {
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
  return hasTag(programData, codename, 'Clinic')
}

/** Get the clinic codenames (e.g. ['CCIM', 'NIMA', 'CLINIC']). */
export function getClinicCodenames(programData: ProgramData): string[] {
  return getCodenamesByTag(programData, 'Clinic')
}

/** Get a sorted list of all codenames for display, ordered by intensity descending. */
export function getDisplayOrderedCodenames(programData: ProgramData): string[] {
  return getAllCodenames(programData).sort((a, b) => {
    const ra = programData.rotations.get(a)
    const rb = programData.rotations.get(b)
    return (rb?.intensity ?? 0) - (ra?.intensity ?? 0)
  })
}
