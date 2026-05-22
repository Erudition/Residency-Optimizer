/**
 * API Client for the Payload CMS backend.
 *
 * Fetches all program configuration via GraphQL and transforms
 * the response into the shapes consumed by the scheduling engine.
 *
 * No hardcoded program data — everything comes from the API.
 */

import { GraphQLClient } from 'graphql-request'
import {
  ROTATIONS_QUERY,
  RESIDENTS_QUERY,
  CLINIC_CYCLES_QUERY,
  ACADEMIC_YEAR_QUERY,
  ALL_ACADEMIC_YEARS_QUERY,
  GRAD_REQUIREMENTS_QUERY,
  AVOIDANCE_RULES_QUERY,
  TAGS_QUERY,
  SCHEDULE_ASSIGNMENTS_QUERY,
  CREATE_SCHEDULE_MUTATION,
  CREATE_SCHEDULE_ASSIGNMENT_MUTATION,
  UPDATE_ACADEMIC_YEAR_MUTATION,
} from './queries'
import type { RotationConfig, Resident, PgyLevel, ScheduleHistory } from '../../types'

// ── Client Setup ──

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const GRAPHQL_ENDPOINT = `${API_URL}/api/graphql`

const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Response Types (raw GraphQL shapes) ──
// These mirror the Payload schema. When graphql-codegen is hooked up
// to a running server, these will be auto-generated.

interface GqlAcademicYear {
  id: number
  startingYear: number
  clinicWeeksPerCycle?: number
  canonicalSchedule?: { id: number } | null
}

interface GqlTag {
  id: number
  title: string
}

interface GqlStaffingPreference {
  internCount: number
  seniorCount: number
}

interface GqlStaffingConfig {
  since: GqlAcademicYear
  preferences: GqlStaffingPreference[]
}

interface GqlRotation {
  id: number
  title: string
  codename: string
  intensity: number
  outpatientPercentage: number
  color: string | null
  isFlexible: boolean
  isPlaceholder: { id: number; title: string } | null
  availableSince: GqlAcademicYear
  availableUntil?: GqlAcademicYear | null
  tags: GqlTag[]
  staffingConfigurations: GqlStaffingConfig[]
}

interface GqlResident {
  id: number
  firstName: string
  lastName: string
  displayName: string
  startYear: GqlAcademicYear
  pgy3Year?: GqlAcademicYear | null
  joinDate?: string | null
  leaveDate?: string | null
  leaveReason?: string | null
}

interface GqlClinicCycle {
  id: number
  number: number
  label: string
  academicYear: GqlAcademicYear
  residents: Array<{ id: number; displayName: string }>
}

interface GqlGradRequirement {
  id: number
  tag: GqlTag
  source: string
  minimum: number
  maximum?: number | null
  ideal?: number | null
  pgy1Ideal?: number | null
  pgy2Ideal?: number | null
  pgy3Ideal?: number | null
  academicYear: GqlAcademicYear
}

interface GqlAvoidanceRule {
  id: number
  resident: { id: number }
  avoidedResident: { id: number }
}

interface GqlSchedule {
  id: number
  academicYear: GqlAcademicYear
}

interface GqlScheduleAssignment {
  id: number
  schedule: GqlSchedule
  resident: { id: number }
  week: number
  rotation: { codename: string }
  locked: boolean
}

// ── Cycle Config ──

export interface CycleConfig {
  /** Number of cohorts (= number of ClinicCycle documents) */
  cohortCount: number
  /** Y: consecutive clinic weeks per cycle */
  Y: number
  /** Z = cohortCount × Y: total cycle length in weeks */
  Z: number
  /** X = Z - Y: inpatient block length */
  X: number
  /** Map of residentId → cohort number (1-based) */
  assignments: Record<string, number>
}

// ── Program Data (everything the engine needs) ──

export interface ProgramData {
  rotations: Map<string, RotationConfig>
  residents: Resident[]
  cycleConfig: CycleConfig
  gradRequirements: GqlGradRequirement[]
  avoidanceRules: GqlAvoidanceRule[]
  tags: GqlTag[]
  /** Tag titles per rotation codename (for requirement fulfillment) */
  rotationTags: Map<string, string[]>
  /** Set of codenames that are placeholder rotations */
  placeholderCodenames: Set<string>
  /** Set of codenames that are flexible (jeopardy-eligible) */
  flexibleCodenames: Set<string>
  historicalSchedules: ScheduleHistory
  historicalCohorts: Record<number, Record<string, number>>
}

export function serializeProgramData(data: ProgramData): any {
  return {
    ...data,
    rotations: Array.from(data.rotations.entries()),
    rotationTags: Array.from(data.rotationTags.entries()),
    placeholderCodenames: Array.from(data.placeholderCodenames),
    flexibleCodenames: Array.from(data.flexibleCodenames)
  };
}

export function deserializeProgramData(data: any): ProgramData {
  if (!data) return data;
  return {
    ...data,
    rotations: new Map(data.rotations),
    rotationTags: new Map(data.rotationTags),
    placeholderCodenames: new Set(data.placeholderCodenames),
    flexibleCodenames: new Set(data.flexibleCodenames)
  };
}

// ── Data Fetching ──

/**
 * Loads all program data for a given academic year from the backend.
 * This is the single entry point for all engine configuration.
 */
export async function loadProgramData(academicYear: number): Promise<ProgramData> {
  // Fetch everything in parallel
  const [
    rotationsRes,
    residentsRes,
    cyclesRes,
    ayRes,
    gradReqsRes,
    avoidanceRes,
    tagsRes,
    assignmentsRes,
  ] = await Promise.all([
    client.request<{ Rotations: { docs: GqlRotation[] } }>(ROTATIONS_QUERY),
    client.request<{ Residents: { docs: GqlResident[] } }>(RESIDENTS_QUERY),
    client.request<{ ClinicCycles: { docs: GqlClinicCycle[] } }>(CLINIC_CYCLES_QUERY),
    client.request<{ AcademicYears: { docs: GqlAcademicYear[] } }>(ACADEMIC_YEAR_QUERY, {
      where: { startingYear: { equals: academicYear } },
    }),
    client.request<{ GradRequirements: { docs: GqlGradRequirement[] } }>(GRAD_REQUIREMENTS_QUERY),
    client.request<{ AvoidanceRules: { docs: GqlAvoidanceRule[] } }>(AVOIDANCE_RULES_QUERY),
    client.request<{ Tags: { docs: GqlTag[] } }>(TAGS_QUERY),
    client.request<{ ScheduleAssignments: { docs: GqlScheduleAssignment[] } }>(SCHEDULE_ASSIGNMENTS_QUERY),
  ])

  let gqlRotations = rotationsRes.Rotations.docs
  let gqlResidents = residentsRes.Residents.docs
  const allGqlCycles = cyclesRes.ClinicCycles.docs
  let gqlCycles = [...allGqlCycles]
  const ay = ayRes.AcademicYears.docs[0]
  let gqlGradReqs = gradReqsRes.GradRequirements.docs
  const gqlAvoidance = avoidanceRes.AvoidanceRules.docs
  const tags = tagsRes.Tags.docs
  const gqlAssignments = assignmentsRes.ScheduleAssignments.docs

  if (!ay) {
    throw new Error(`Academic year ${academicYear} not found in the backend`)
  }

  // ── Resolve canonical schedule IDs for historical filtering ──
  // Fetch ALL academic years to build the set of canonical schedule IDs.
  // This ensures historical schedules are loaded only from the official record.
  const allAYsRes = await client.request<{ AcademicYears: { docs: GqlAcademicYear[] } }>(
    ALL_ACADEMIC_YEARS_QUERY,
  )
  const canonicalScheduleIds = new Set(
    allAYsRes.AcademicYears.docs
      .filter(ayDoc => ayDoc.canonicalSchedule)
      .map(ayDoc => ayDoc.canonicalSchedule!.id),
  )

  // Locally filter relationship data to bypass Payload GraphQL nested operator limitations
  gqlRotations = gqlRotations.filter(r => 
    r.availableSince?.startingYear <= academicYear &&
    (!r.availableUntil || r.availableUntil.startingYear >= academicYear)
  )

  // Keep all residents in the master list so the frontend can dynamically filter by the active year
  // (to support multi-year generation and viewing historical/future schedules).

  gqlCycles = gqlCycles.filter(c => c.academicYear?.startingYear === academicYear)
  gqlGradReqs = gqlGradReqs.filter(g => g.academicYear?.startingYear === academicYear)

  // ── Transform Rotations ──
  const rotations = new Map<string, RotationConfig>()
  const rotationTags = new Map<string, string[]>()
  const placeholderCodenames = new Set<string>()
  const flexibleCodenames = new Set<string>()

  for (const r of gqlRotations) {
    // Find the staffing config effective for this year
    const staffing = getEffectiveStaffing(r.staffingConfigurations, academicYear)

    const config: RotationConfig = {
      type: r.codename as RotationConfig['type'],
      label: r.title,
      category: r.tags[0]?.title,
      intensity: r.intensity,
      duration: 4, // Default block length; will be replaced by X from cycle config
      setting: deriveSettingFromPercentage(r.outpatientPercentage),
      minInterns: staffing?.preferences.length
        ? Math.min(...staffing.preferences.map(p => p.internCount))
        : 0,
      maxInterns: staffing?.preferences.length
        ? Math.max(...staffing.preferences.map(p => p.internCount))
        : 0,
      minSeniors: staffing?.preferences.length
        ? Math.min(...staffing.preferences.map(p => p.seniorCount))
        : 0,
      maxSeniors: staffing?.preferences.length
        ? Math.max(...staffing.preferences.map(p => p.seniorCount))
        : 0,
      color: r.color ? parseInt(r.color, 10) : undefined,
    }

    rotations.set(r.codename, config)

    rotationTags.set(r.codename, r.tags.map(t => t.title))

    if (r.isPlaceholder) placeholderCodenames.add(r.codename)
    if (r.isFlexible) flexibleCodenames.add(r.codename)
  }

  // ── Transform Residents ──
  // Build avoidance map: residentBackendId → set of avoidBackendIds
  const avoidMap = new Map<number, Set<number>>()
  for (const rule of gqlAvoidance) {
    if (!avoidMap.has(rule.resident.id)) avoidMap.set(rule.resident.id, new Set())
    avoidMap.get(rule.resident.id)!.add(rule.avoidedResident.id)
  }

  // Map backend IDs to frontend string IDs
  const backendIdToFrontendId = new Map<number, string>()

  const residents: Resident[] = gqlResidents.map(r => {
    const frontendId = `${r.id}`
    backendIdToFrontendId.set(r.id, frontendId)

    const pgyLevel = Math.min(3, Math.max(1, academicYear - r.startYear.startingYear + 1)) as PgyLevel

    // Compute transferOutYear from leaveDate.
    // The academic year starting in year Y ends on June 30 of Y+1.
    // If they leave on or after June 15 of Y+1, they completed academic year Y,
    // and should be excluded starting academic year Y+1.
    let transferOutYear: number | undefined
    if (r.leaveDate) {
      const date = new Date(r.leaveDate)
      const leaveYearNum = date.getFullYear()
      const leaveMonth = date.getMonth()
      const leaveDay = date.getDate()
      if (leaveMonth < 5 || (leaveMonth === 5 && leaveDay < 15)) {
        transferOutYear = leaveYearNum - 1
      } else {
        transferOutYear = leaveYearNum
      }
    }

    return {
      id: frontendId,
      name: r.displayName,
      level: pgyLevel,
      startYear: r.startYear.startingYear,
      avoidResidentIds: [], // Will be populated after all residents are created
      transferOutYear,
    }
  })

  // Now populate avoidResidentIds using the backend→frontend ID mapping
  for (const resident of residents) {
    const backendId = parseInt(resident.id, 10)
    const avoids = avoidMap.get(backendId)
    if (avoids) {
      resident.avoidResidentIds = Array.from(avoids)
        .map(id => backendIdToFrontendId.get(id))
        .filter((id): id is string => id !== undefined)
    }
  }

  // ── Build Cycle Config ──
  const Y = ay.clinicWeeksPerCycle ?? 1
  const cohortCount = gqlCycles.length
  const Z = cohortCount * Y
  const X = Z - Y

  const cycleAssignments: Record<string, number> = {}
  for (const cycle of gqlCycles) {
    for (const resident of cycle.residents) {
      cycleAssignments[`${resident.id}`] = cycle.number - 1
    }
  }

  const cycleConfig: CycleConfig = {
    cohortCount,
    Y,
    Z,
    X,
    assignments: cycleAssignments,
  }

  // ── Construct Historical Cohorts ──
  const historicalCohorts: Record<number, Record<string, number>> = {}
  for (const cycle of allGqlCycles) {
    const year = cycle.academicYear?.startingYear
    if (year && year <= academicYear) {
      if (!historicalCohorts[year]) historicalCohorts[year] = {}
      for (const resident of cycle.residents) {
        historicalCohorts[year][resident.id.toString()] = cycle.number - 1
      }
    }
  }

  // ── Transform Historical Schedules ──
  const historicalSchedules: ScheduleHistory = {}
  for (const assign of gqlAssignments) {
    // Only load assignments from canonical (official) schedules
    if (canonicalScheduleIds.size > 0 && !canonicalScheduleIds.has(assign.schedule.id)) continue

    const year = assign.schedule?.academicYear?.startingYear
    if (year && year <= academicYear) {
      const residentId = assign.resident.id.toString()
      const weekIndex = assign.week - 1
      const codename = assign.rotation.codename
      const isFullyCompleted = year < academicYear - 1

      if (!historicalSchedules[year]) historicalSchedules[year] = {}
      if (!historicalSchedules[year][residentId]) {
        // Null slots are always unlocked — they represent missing data that
        // can be resolved after the fact, even in completed historical years.
        historicalSchedules[year][residentId] = Array.from({ length: 52 }, () => ({
          assignment: null as any,
          locked: false,
        }))
      }
      // Placeholder rotations (e.g. unspecified ELEC) remain unlocked so
      // admins can resolve them to the actual elective retroactively.
      const isPlaceholder = placeholderCodenames.has(codename)
      historicalSchedules[year][residentId][weekIndex] = {
        assignment: codename,
        locked: isPlaceholder ? false : (isFullyCompleted || assign.locked),
      }
    }
  }

  return {
    rotations,
    residents,
    cycleConfig,
    gradRequirements: gqlGradReqs,
    avoidanceRules: gqlAvoidance,
    tags,
    rotationTags,
    placeholderCodenames,
    flexibleCodenames,
    historicalSchedules,
    historicalCohorts,
  }
}

// ── Helpers ──

/**
 * Finds the effective staffing configuration for a given academic year.
 * Returns the config with the highest `since` year that is <= the given year.
 */
function getEffectiveStaffing(
  configs: GqlStaffingConfig[],
  year: number,
): GqlStaffingConfig | undefined {
  const applicable = configs
    .filter(c => c.since.startingYear <= year)
    .sort((a, b) => b.since.startingYear - a.since.startingYear)
  return applicable[0]
}

/**
 * Derives a ClinicalSetting-like value from outpatient percentage.
 * This is a bridge for backward compatibility with the frontend's
 * ClinicalSetting enum during the migration.
 */
function deriveSettingFromPercentage(outpatientPct: number): RotationConfig['setting'] {
  if (outpatientPct >= 80) return 'Outpatient' as any
  if (outpatientPct === 0) return 'Inpatient' as any
  return 'Inpatient' as any // Default; the engine uses intensity, not setting
}

// ── Schedule Promotion ──

interface PromoteParams {
  /** The academic year's starting year (e.g. 2025 for AY 2025-26) */
  academicYear: number
  /** Schedule grid for the year: residentId → ScheduleCell[] (length 52) */
  grid: import('../../types').ScheduleGrid
  /** Title for the canonical schedule */
  title: string
}

/**
 * Promotes a schedule to become the canonical (official) historical record
 * for a given academic year. Creates a new standalone Schedule document with
 * locked assignments and sets it as canonicalSchedule on the AcademicYear.
 *
 * Resolves all backend IDs (AY, rotations) internally so the caller only
 * needs to pass frontend data.
 *
 * Returns the ID of the newly created canonical schedule.
 */
export async function promoteScheduleToCanonical(params: PromoteParams): Promise<number> {
  const { academicYear, grid, title } = params

  // Resolve the AcademicYear backend ID
  const ayRes = await client.request<{ AcademicYears: { docs: { id: number; startingYear: number }[] } }>(
    ACADEMIC_YEAR_QUERY,
    { where: { startingYear: { equals: academicYear } } },
  )
  const ayDoc = ayRes.AcademicYears.docs[0]
  if (!ayDoc) throw new Error(`Academic year ${academicYear} not found in backend`)

  // Resolve rotation codename → backend ID map
  const rotRes = await client.request<{ Rotations: { docs: { id: number; codename: string }[] } }>(
    ROTATIONS_QUERY,
  )
  const rotationIdMap = new Map(rotRes.Rotations.docs.map(r => [r.codename, r.id]))

  // 1. Create a standalone schedule (no candidate link)
  const scheduleRes = await client.request<{
    createSchedule: { id: number; title: string }
  }>(CREATE_SCHEDULE_MUTATION, {
    data: {
      title,
      academicYear: ayDoc.id,
      _status: 'published',
    },
  })
  const newScheduleId = scheduleRes.createSchedule.id

  // 2. Create locked assignments for each resident/week
  const createPromises: Promise<any>[] = []
  for (const [residentId, cells] of Object.entries(grid)) {
    for (let w = 0; w < cells.length; w++) {
      const cell = cells[w]
      if (!cell?.assignment) continue

      const rotId = rotationIdMap.get(cell.assignment)
      if (!rotId) continue

      createPromises.push(
        client.request(CREATE_SCHEDULE_ASSIGNMENT_MUTATION, {
          data: {
            schedule: newScheduleId,
            resident: parseInt(residentId, 10),
            week: w + 1,
            rotation: rotId,
            locked: true,
          },
        }),
      )
    }
  }
  // Execute in batches to avoid overwhelming the backend
  const BATCH_SIZE = 50
  for (let i = 0; i < createPromises.length; i += BATCH_SIZE) {
    await Promise.all(createPromises.slice(i, i + BATCH_SIZE))
  }

  // 3. Set this schedule as canonical on the academic year
  await client.request(UPDATE_ACADEMIC_YEAR_MUTATION, {
    id: ayDoc.id,
    data: { canonicalSchedule: newScheduleId },
  })

  return newScheduleId
}

/**
 * Checks if a given academic year already has a canonical schedule.
 * Returns the canonical schedule ID if one exists, null otherwise.
 */
export async function getCanonicalScheduleId(academicYear: number): Promise<number | null> {
  const res = await client.request<{ AcademicYears: { docs: GqlAcademicYear[] } }>(
    ACADEMIC_YEAR_QUERY,
    { where: { startingYear: { equals: academicYear } } },
  )
  return res.AcademicYears.docs[0]?.canonicalSchedule?.id ?? null
}
