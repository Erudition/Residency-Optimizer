/**
 * Resident ID Remapping Utility
 *
 * When a JSON backup is restored from a different database era, the resident
 * IDs in the schedule grid may not match the current backend residents.
 * This utility detects the mismatch and remaps grid keys by matching
 * resident display names.
 */

import type { ScheduleGrid, ScheduleHistory, Resident } from '../types';

/** Normalize a display name for fuzzy matching: trim, lowercase, strip trailing commas/whitespace */
const normalizeName = (name: string): string =>
  name.trim().replace(/,\s*$/, '').toLowerCase();

export interface RemapStats {
  /** Total unique resident IDs found in the grid */
  totalGridIds: number;
  /** Number of grid IDs that already matched a known (current) resident */
  alreadyMatched: number;
  /** Number of stale grid IDs successfully remapped by name */
  remapped: number;
  /** Number of stale grid IDs that could NOT be matched to any current resident */
  unmatched: number;
  /** Names of residents that could not be matched */
  unmatchedNames: string[];
  /** Whether any remapping was actually needed */
  needed: boolean;
}

export interface RemapResult {
  data: ScheduleHistory;
  cohortAssignments?: Record<number, Record<string, number>>;
  stats: RemapStats;
}

/**
 * Detect whether a schedule's grid keys are stale relative to the current
 * resident list.  Returns true if fewer than half the grid's resident IDs
 * exist in `currentResidents`.
 */
export function detectStaleResidentIds(
  data: ScheduleHistory,
  currentResidents: Resident[],
): boolean {
  const knownIds = new Set(currentResidents.map(r => r.id));
  const gridIds = new Set(
    Object.values(data).flatMap(grid => Object.keys(grid)),
  );
  if (gridIds.size === 0) return false;

  const matchCount = [...gridIds].filter(id => knownIds.has(id)).length;
  return matchCount / gridIds.size < 0.5;
}

/**
 * Remap schedule grid keys from stale resident IDs to current backend IDs
 * by matching on display name.
 *
 * @param data          Per-year schedule grids keyed by stale resident IDs
 * @param backupResidents  The residents array from the backup JSON (maps staleId → name)
 * @param currentResidents The current backend residents (maps name → currentId)
 * @param cohortAssignments Optional cohort assignments to remap in tandem
 */
export function remapScheduleResidentIds(
  data: ScheduleHistory,
  backupResidents: Array<{ id: string | number; name: string }>,
  currentResidents: Resident[],
  cohortAssignments?: Record<number, Record<string, number>>,
): RemapResult {
  const knownIds = new Set(currentResidents.map(r => r.id));

  // Collect all unique grid resident IDs across all years
  const allGridIds = new Set(
    Object.values(data).flatMap(grid => Object.keys(grid)),
  );

  // Quick exit: if most IDs already match, no remapping needed
  const alreadyMatched = [...allGridIds].filter(id => knownIds.has(id)).length;
  if (allGridIds.size > 0 && alreadyMatched / allGridIds.size >= 0.5) {
    return {
      data,
      cohortAssignments,
      stats: {
        totalGridIds: allGridIds.size,
        alreadyMatched,
        remapped: 0,
        unmatched: 0,
        unmatchedNames: [],
        needed: false,
      },
    };
  }

  // Build lookup: stale ID → backup resident name
  const staleIdToName = new Map<string, string>();
  for (const r of backupResidents) {
    staleIdToName.set(String(r.id), r.name);
  }

  // Build lookup: normalized name → current resident ID
  // Exact name first, then normalized fallback
  const exactNameToId = new Map<string, string>();
  const normalizedNameToId = new Map<string, string>();
  for (const r of currentResidents) {
    exactNameToId.set(r.name, r.id);
    normalizedNameToId.set(normalizeName(r.name), r.id);
  }

  // Build the remap: staleId → currentId
  const idRemap = new Map<string, string>();
  const unmatchedNames: string[] = [];
  let remappedCount = 0;

  for (const staleId of allGridIds) {
    // Already a valid current ID? Keep as-is
    if (knownIds.has(staleId)) continue;

    const name = staleIdToName.get(staleId);
    if (!name) {
      // ID not in backup residents list — can't remap
      unmatchedNames.push(`ID ${staleId} (unknown)`);
      continue;
    }

    // Try exact match first
    let currentId = exactNameToId.get(name);
    if (!currentId) {
      // Try normalized match
      currentId = normalizedNameToId.get(normalizeName(name));
    }

    if (currentId) {
      idRemap.set(staleId, currentId);
      remappedCount++;
    } else {
      unmatchedNames.push(name);
    }
  }

  // Apply remapping to grid data
  const remappedData: ScheduleHistory = {};
  for (const [yearStr, grid] of Object.entries(data)) {
    const year = parseInt(yearStr, 10);
    const remappedGrid: ScheduleGrid = {};
    for (const [resId, cells] of Object.entries(grid)) {
      const newId = idRemap.get(resId) ?? resId;
      remappedGrid[newId] = cells;
    }
    remappedData[year] = remappedGrid;
  }

  // Apply remapping to cohort assignments
  let remappedCohorts = cohortAssignments;
  if (cohortAssignments) {
    remappedCohorts = {};
    for (const [yearStr, yearMap] of Object.entries(cohortAssignments)) {
      const year = parseInt(yearStr, 10);
      const remapped: Record<string, number> = {};
      for (const [resId, cohortIdx] of Object.entries(yearMap)) {
        const newId = idRemap.get(resId) ?? resId;
        remapped[newId] = cohortIdx;
      }
      remappedCohorts[year] = remapped;
    }
  }

  return {
    data: remappedData,
    cohortAssignments: remappedCohorts,
    stats: {
      totalGridIds: allGridIds.size,
      alreadyMatched,
      remapped: remappedCount,
      unmatched: unmatchedNames.length,
      unmatchedNames,
      needed: true,
    },
  };
}

/**
 * Compare a backup's residents against the current backend residents
 * and return a summary of differences (for warning dialogs).
 */
export function compareResidentLists(
  backupResidents: Array<{ id: string | number; name: string }>,
  currentResidents: Resident[],
): {
  backupOnly: string[];   // Names in backup but not in current
  currentOnly: string[];  // Names in current but not in backup
  countDiffers: boolean;
} {
  const backupNames = new Set(backupResidents.map(r => normalizeName(r.name)));
  const currentNames = new Set(currentResidents.map(r => normalizeName(r.name)));

  // Use original (non-normalized) names for display
  const backupNameMap = new Map(backupResidents.map(r => [normalizeName(r.name), r.name]));
  const currentNameMap = new Map(currentResidents.map(r => [normalizeName(r.name), r.name]));

  const backupOnly = [...backupNames]
    .filter(n => !currentNames.has(n))
    .map(n => backupNameMap.get(n) || n);

  const currentOnly = [...currentNames]
    .filter(n => !backupNames.has(n))
    .map(n => currentNameMap.get(n) || n);

  return {
    backupOnly,
    currentOnly,
    countDiffers: backupResidents.length !== currentResidents.length,
  };
}
