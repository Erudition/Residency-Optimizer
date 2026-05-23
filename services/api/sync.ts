/**
 * Schedule Sync Service
 *
 * Manages bidirectional synchronization of candidate schedules between
 * the frontend and Payload CMS backend:
 *
 *   Writes: Frontend → GraphQL mutations → Payload DB
 *   Reads:  Payload afterChange hooks → SSE endpoint → Frontend EventSource
 *
 * Design principles:
 *   - Offline-first: all edits apply to local state immediately
 *   - Backend sync is opportunistic — failures are queued for retry
 *   - Deduplication: SSE events from this client are ignored (via clientId)
 *   - Debounced cell writes to avoid chatty mutations during rapid editing
 */

import { GraphQLClient } from 'graphql-request'
import type { ScheduleGrid } from '../../types'
import { getAuthHeaders, getToken, isAuthenticated } from './auth'
import {
  CANDIDATES_WITH_SCHEDULES_QUERY,
  CREATE_CANDIDATE_MUTATION,
  UPDATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  DELETE_CANDIDATE_MUTATION,
  FIND_ASSIGNMENT_QUERY,
  UPDATE_SCHEDULE_ASSIGNMENT_MUTATION,
  CREATE_SCHEDULE_ASSIGNMENT_MUTATION,
  ROTATIONS_QUERY,
  ACADEMIC_YEAR_QUERY,
  FIRST_TENANT_QUERY,
} from './queries'

// ── Types ──

export type SyncStatus = 'local-only' | 'connected' | 'live' | 'error'

/** Typed error thrown by sync operations so callers can surface user-facing messages. */
export class SyncError extends Error {
  constructor(
    message: string,
    public code:
      | 'AUTH_REQUIRED'
      | 'CACHE_FAILED'
      | 'CREATE_FAILED'
      | 'SAVE_FAILED'
      | 'DELETE_FAILED'
      | 'LOAD_FAILED'
      | 'UPSERT_FAILED',
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'SyncError'
  }
}

export type SyncErrorHandler = (error: SyncError) => void

export interface AssignmentChangeEvent {
  type: 'assignment-change'
  scheduleId: number
  residentId: number
  week: number
  rotation: string
  locked: boolean
}

export interface ScheduleCreatedEvent {
  type: 'schedule-created'
  scheduleId: number
  title: string
  academicYear: number
  assignmentCount?: number
}

export interface ScheduleUpdatedEvent {
  type: 'schedule-updated'
  scheduleId: number
  title: string
}

export interface ScheduleDeletedEvent {
  type: 'schedule-deleted'
  scheduleId: number
}

export type ScheduleSyncEvent =
  | AssignmentChangeEvent
  | ScheduleCreatedEvent
  | ScheduleUpdatedEvent
  | ScheduleDeletedEvent

type EventHandler = (event: ScheduleSyncEvent) => void

// ── Debounce helper ──

interface PendingCellWrite {
  scheduleId: number
  residentId: number
  week: number
  rotationCodename: string
  locked: boolean
  timer: ReturnType<typeof setTimeout>
}

// ── Service ──

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const GRAPHQL_ENDPOINT = `${API_URL}/api/graphql`
const SSE_BASE = `${API_URL}/api/sync/stream`

const DEBOUNCE_MS = 300
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

export class ScheduleSyncService {
  private client: GraphQLClient
  private clientId: string
  private eventSource: EventSource | null = null
  private handlers: Set<EventHandler> = new Set()
  private _candidateId: number | null = null
  // Seed from auth state so the badge is correct immediately on first render.
  // isAuthenticated() does a localStorage read-through, so this is reliable
  // even if the module IIFE ran before storage was fully populated.
  private _status: SyncStatus = isAuthenticated() ? 'connected' : 'local-only'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWrites: Map<string, PendingCellWrite> = new Map()
  private errorHandlers: Set<SyncErrorHandler> = new Set()
  /** Accumulates failed upsert count for batched error reporting */
  private _failedUpsertCount = 0
  private _failedUpsertTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly UPSERT_ERROR_BATCH_MS = 3_000

  // Cache: rotation codename → backend ID
  private rotationIdCache: Map<string, number> | null = null
  // Cache: academic year starting year → backend AY ID
  private ayIdCache: Map<number, number> | null = null
  // Cache: current user's first tenant ID (undefined = not yet fetched)
  private tenantIdCache: number | null | undefined = undefined

  constructor() {
    this.client = new GraphQLClient(GRAPHQL_ENDPOINT, {
      headers: { 'Content-Type': 'application/json' },
    })
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * Refresh the GraphQL client headers with the current auth token.
   * Must be called before any authenticated request.
   */
  private refreshAuthHeaders(): void {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    }
    this.client = new GraphQLClient(GRAPHQL_ENDPOINT, { headers })
  }

  // ── Connection Management ──

  get isConnected(): boolean {
    return this._status === 'live'
  }

  get syncStatus(): SyncStatus {
    return this._status
  }

  get candidateId(): number | null {
    return this._candidateId
  }

  /**
   * Open an SSE connection to a candidate's schedule stream.
   */
  connect(candidateId: number): void {
    // Disconnect existing connection if any
    if (this.eventSource) {
      this.disconnect()
    }

    this._candidateId = candidateId
    this._status = 'connected'
    this.reconnectAttempts = 0

    this.openEventSource()
  }

  /**
   * Close the SSE connection and clean up.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this._status = isAuthenticated() ? 'connected' : 'local-only'
    this._candidateId = null
    this.reconnectAttempts = 0
  }

  /**
   * Register an event handler. Returns an unsubscribe function.
   */
  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /**
   * Register a handler for batched background errors (cell upserts).
   * Returns an unsubscribe function.
   */
  onError(handler: SyncErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  private emitError(error: SyncError): void {
    for (const h of this.errorHandlers) {
      try { h(error) } catch { /* don't let handler errors propagate */ }
    }
  }

  // ── Writes ──

  /**
   * Upsert a single cell assignment (debounced).
   * The edit is applied locally by the caller; this fires the backend mutation
   * in the background after a quiet period.
   */
  upsertCell(
    scheduleId: number,
    residentId: number,
    week: number,
    rotationCodename: string,
    locked: boolean,
  ): void {
    // Synthetic residents (non-numeric IDs) can't be synced until the schedule
    // is published and their grid keys are remapped to backend numeric IDs.
    if (isNaN(residentId)) return

    const key = `${scheduleId}:${residentId}:${week}`

    // Cancel any pending write for this cell
    const existing = this.pendingWrites.get(key)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      this.pendingWrites.delete(key)
      this.executeUpsertCell(scheduleId, residentId, week, rotationCodename, locked)
    }, DEBOUNCE_MS)

    this.pendingWrites.set(key, {
      scheduleId,
      residentId,
      week,
      rotationCodename,
      locked,
      timer,
    })
  }

  /**
   * Rename a schedule on the backend.
   */
  async renameSchedule(backendId: number, title: string): Promise<void> {
    if (!isAuthenticated()) return
    try {
      this.refreshAuthHeaders()
      await this.client.request(UPDATE_SCHEDULE_MUTATION, {
        id: backendId,
        data: { title },
      })
    } catch (err) {
      throw new SyncError(
        `Failed to rename schedule: ${err instanceof Error ? err.message : 'unknown error'}`,
        'SAVE_FAILED',
        err,
      )
    }
  }

  /**
   * Delete a schedule from the backend.
   */
  async deleteSchedule(backendId: number): Promise<void> {
    if (!isAuthenticated()) return
    try {
      this.refreshAuthHeaders()
      await this.client.request(DELETE_SCHEDULE_MUTATION, {
        id: backendId,
      })
    } catch (err) {
      throw new SyncError(
        `Failed to delete schedule: ${err instanceof Error ? err.message : 'unknown error'}`,
        'DELETE_FAILED',
        err,
      )
    }
  }

  /**
   * Delete a Candidate and all its child documents (cascade via backend hook).
   */
  async deleteCandidate(candidateId: number): Promise<void> {
    if (!isAuthenticated()) return
    try {
      this.refreshAuthHeaders()
      await this.client.request(DELETE_CANDIDATE_MUTATION, {
        id: candidateId,
      })
    } catch (err) {
      throw new SyncError(
        `Failed to delete candidate: ${err instanceof Error ? err.message : 'unknown error'}`,
        'DELETE_FAILED',
        err,
      )
    }
  }

  // ── Candidate Management ──

  /**
   * Create a new Candidate with the given title.
   * Each generation creates a fresh Candidate (no dedup by year).
   */
  async createCandidate(
    startYear: number,
    title: string,
  ): Promise<{ candidateId: number }> {
    if (!isAuthenticated()) throw new SyncError('Not authenticated', 'AUTH_REQUIRED')
    this.refreshAuthHeaders()
    await this.ensureCaches()

    const ayId = this.ayIdCache?.get(startYear)
    if (!ayId) {
      throw new SyncError(
        `Academic year ${startYear} not found in backend`,
        'CREATE_FAILED',
      )
    }

    try {
      const createRes = await this.client.request<{
        createCandidate: { id: number; title: string }
      }>(CREATE_CANDIDATE_MUTATION, {
        data: {
          title,
          startingYear: ayId,
          status: 'active',
          ...(this.tenantIdCache != null ? { tenant: this.tenantIdCache } : {}),
        },
      })

      const candidateId = createRes.createCandidate.id
      console.log(`[Sync] Created candidate ${candidateId}: "${title}"`)
      return { candidateId }
    } catch (err) {
      throw new SyncError(
        `Failed to create candidate: ${err instanceof Error ? err.message : 'unknown error'}`,
        'CREATE_FAILED',
        err,
      )
    }
  }

  /**
   * Save all 3 year grids for a candidate via the bulk endpoint.
   * Creates a Schedule for each year and saves all assignments.
   *
   * Synthetic residents (non-numeric IDs like "c2027-1") are automatically
   * upserted in the backend with isSynthetic: true. The returned
   * residentIdMap maps frontend synthetic keys → backend numeric IDs so
   * the caller can remap in-memory grid keys for subsequent cell edits.
   */
  async saveCandidateGrids(
    candidateId: number,
    title: string,
    data: Record<number, ScheduleGrid>,
    residents: Array<{ id: string; name: string; startYear: number }>,
  ): Promise<{ scheduleIds: Record<number, number>; errors: string[]; residentIdMap: Record<string, number> }> {
    if (!isAuthenticated()) throw new SyncError('Not authenticated', 'AUTH_REQUIRED')
    this.refreshAuthHeaders()
    const scheduleIds: Record<number, number> = {}
    const errors: string[] = []
    const residentIdMap: Record<string, number> = {}

    await this.ensureCaches()

    // Build a lookup from resident ID → metadata (for synthetic resident creation)
    const residentLookup = new Map(residents.map(r => [r.id, r]))

    for (const [yearStr, grid] of Object.entries(data)) {
      const year = parseInt(yearStr, 10)
      if (!grid) continue

      const ayId = this.ayIdCache?.get(year)
      if (!ayId) {
        errors.push(`AY ${year} not found`)
        continue
      }

      // Identify synthetic residents in this year's grid
      const syntheticResidents: Array<{
        frontendKey: string
        firstName: string
        lastName: string
        startYearId: number
      }> = []

      const assignments: Array<{
        residentId: number | string
        week: number
        rotationId: number
        locked: boolean
      }> = []

      for (const [residentId, cells] of Object.entries(grid)) {
        const isSynthetic = isNaN(parseInt(residentId, 10))

        // Collect synthetic resident metadata for this year (deduplicate across years)
        if (isSynthetic && !residentIdMap[residentId]) {
          const resident = residentLookup.get(residentId)
          if (resident) {
            // Parse name like "New 2027 Resident 1" → firstName: "New 2027 Resident", lastName: "1"
            const lastSpace = resident.name.lastIndexOf(' ')
            const firstName = lastSpace > 0 ? resident.name.substring(0, lastSpace) : resident.name
            const lastName = lastSpace > 0 ? resident.name.substring(lastSpace + 1) : '1'

            const startYearId = this.ayIdCache?.get(resident.startYear)
            if (startYearId) {
              syntheticResidents.push({
                frontendKey: residentId,
                firstName,
                lastName,
                startYearId,
              })
            }
          }
        }

        for (let w = 0; w < cells.length; w++) {
          const cell = cells[w]
          if (!cell?.assignment) continue

          const rotId = this.rotationIdCache?.get(cell.assignment)
          if (!rotId) continue

          assignments.push({
            // Send string key for synthetic residents — backend will remap
            residentId: isSynthetic ? residentId : parseInt(residentId, 10),
            week: w + 1,
            rotationId: rotId,
            locked: cell.locked,
          })
        }
      }

      try {
        const response = await fetch(`${API_URL}/api/sync/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            candidateId,
            title: `${title} — AY ${year}`,
            academicYearId: ayId,
            assignments,
            ...(syntheticResidents.length > 0 ? { syntheticResidents } : {}),
          }),
        })

        if (response.ok) {
          const result = await response.json()
          scheduleIds[year] = result.scheduleId
          // Merge per-year residentIdMap into the cumulative one
          if (result.residentIdMap) {
            Object.assign(residentIdMap, result.residentIdMap)
          }
          console.log(`[Sync] Saved year ${year} → schedule ${result.scheduleId} (${assignments.length} assignments)`)
        } else {
          const err = await response.json().catch(() => ({ error: 'unknown' }))
          errors.push(`AY ${year}: ${err.error || response.statusText}`)
        }
      } catch (err) {
        errors.push(`AY ${year}: ${err instanceof Error ? err.message : 'network error'}`)
      }
    }

    // If no years succeeded, throw
    if (Object.keys(scheduleIds).length === 0) {
      throw new SyncError(
        `Failed to save any schedule data: ${errors.join('; ')}`,
        'SAVE_FAILED',
      )
    }

    return { scheduleIds, errors, residentIdMap }
  }

  // ── Data Loading ──

  /**
   * Load all active candidates from the backend using a single nested GraphQL
   * query. Fetches candidates → schedules → assignments in one round trip.
   */
  async loadAllCandidates(): Promise<
    Array<{
      candidateId: number
      title: string
      startYear: number
      scheduleIds: Record<number, number>
      yearData: Record<
        number,
        Array<{
          residentId: number
          week: number
          rotation: string
          locked: boolean
        }>
      >
    }>
  > {
    if (!isAuthenticated()) return []
    this.refreshAuthHeaders()

    try {
      const res = await this.client.request<{
        Candidates: {
          docs: Array<{
            id: number
            title: string
            status: string
            startingYear: { id: number; startingYear: number }
            schedules: {
              docs: Array<{
                id: number
                title: string
                academicYear: { id: number; startingYear: number }
                scheduleAssignments: {
                  docs: Array<{
                    resident: { id: number }
                    week: number
                    rotation: { codename: string }
                    locked: boolean
                  }>
                }
              }>
            }
          }>
        }
      }>(CANDIDATES_WITH_SCHEDULES_QUERY, {
        where: { status: { equals: 'active' } },
      })

      const candidates = res.Candidates.docs
      if (candidates.length === 0) return []

      const results = candidates.map((candidate) => {
        const scheduleIds: Record<number, number> = {}
        const yearData: Record<
          number,
          Array<{
            residentId: number
            week: number
            rotation: string
            locked: boolean
          }>
        > = {}

        for (const sched of candidate.schedules.docs) {
          const year = sched.academicYear.startingYear
          scheduleIds[year] = sched.id

          yearData[year] = sched.scheduleAssignments.docs.map((a) => ({
            residentId: a.resident.id,
            week: a.week,
            rotation: a.rotation.codename,
            locked: a.locked,
          }))
        }

        return {
          candidateId: candidate.id,
          title: candidate.title,
          startYear: candidate.startingYear.startingYear,
          scheduleIds,
          yearData,
        }
      })

      console.log(`[Sync] Loaded ${results.length} candidates from backend (1 query)`)
      return results
    } catch (err) {
      throw new SyncError(
        `Failed to load candidates: ${err instanceof Error ? err.message : 'unknown error'}`,
        'LOAD_FAILED',
        err,
      )
    }
  }


  // ── Private helpers ──

  private openEventSource(): void {
    if (!this._candidateId) return

    const token = getToken()
    let url = `${SSE_BASE}/${this._candidateId}?clientId=${encodeURIComponent(this.clientId)}`
    if (token) {
      url += `&token=${encodeURIComponent(token)}`
    }

    try {
      this.eventSource = new EventSource(url)

      this.eventSource.addEventListener('connected', () => {
        this._status = 'live'
        this.reconnectAttempts = 0
      })

      this.eventSource.addEventListener('assignment-change', (e) => {
        this.handleSSEEvent('assignment-change', e)
      })

      this.eventSource.addEventListener('schedule-created', (e) => {
        this.handleSSEEvent('schedule-created', e)
      })

      this.eventSource.addEventListener('schedule-updated', (e) => {
        this.handleSSEEvent('schedule-updated', e)
      })

      this.eventSource.addEventListener('schedule-deleted', (e) => {
        this.handleSSEEvent('schedule-deleted', e)
      })

      this.eventSource.addEventListener('bulk-sync', (e) => {
        // Treat bulk-sync as a schedule-created for the handler
        this.handleSSEEvent('schedule-created', e)
      })

      this.eventSource.onerror = () => {
        this._status = 'connected'
        this.eventSource?.close()
        this.eventSource = null
        this.scheduleReconnect()
      }
    } catch {
      this._status = 'connected'
      this.scheduleReconnect()
    }
  }

  private handleSSEEvent(type: string, e: MessageEvent): void {
    try {
      const data = JSON.parse(e.data)

      // Skip events originated by this client
      if (data.originClientId === this.clientId) return

      const event: ScheduleSyncEvent = { ...data, type } as ScheduleSyncEvent

      for (const handler of this.handlers) {
        try {
          handler(event)
        } catch (err) {
          console.error('[Sync] Event handler error:', err)
        }
      }
    } catch (err) {
      console.error('[Sync] Failed to parse SSE event:', err)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    if (!this._candidateId) return

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    )
    this.reconnectAttempts++

    console.log(`[Sync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openEventSource()
    }, delay)
  }

  private async executeUpsertCell(
    scheduleId: number,
    residentId: number,
    week: number,
    rotationCodename: string,
    locked: boolean,
  ): Promise<void> {
    if (!isAuthenticated()) return
    try {
      this.refreshAuthHeaders()
      await this.ensureCaches()
      const rotId = this.rotationIdCache?.get(rotationCodename)
      if (!rotId) {
        console.warn(`[Sync] Rotation "${rotationCodename}" not found in cache`)
        return
      }

      // Check if an assignment already exists for this cell
      const existing = await this.client.request<{
        ScheduleAssignments: {
          docs: Array<{ id: number }>
        }
      }>(FIND_ASSIGNMENT_QUERY, {
        where: {
          schedule: { equals: scheduleId },
          resident: { equals: residentId },
          week: { equals: week },
        },
      })

      if (existing.ScheduleAssignments.docs.length > 0) {
        // Update existing
        await this.client.request(UPDATE_SCHEDULE_ASSIGNMENT_MUTATION, {
          id: existing.ScheduleAssignments.docs[0].id,
          data: {
            rotation: rotId,
            locked,
          },
        })
      } else {
        // Create new
        await this.client.request(CREATE_SCHEDULE_ASSIGNMENT_MUTATION, {
          data: {
            schedule: scheduleId,
            resident: residentId,
            week,
            rotation: rotId,
            locked,
          },
        })
      }
    } catch (err) {
      console.error('[Sync] Cell upsert failed:', err)
      // Batch upsert failures and emit as a single error event after a quiet period
      this._failedUpsertCount++
      if (this._failedUpsertTimer) clearTimeout(this._failedUpsertTimer)
      this._failedUpsertTimer = setTimeout(() => {
        const count = this._failedUpsertCount
        this._failedUpsertCount = 0
        this._failedUpsertTimer = null
        this.emitError(new SyncError(
          `${count} cell edit${count > 1 ? 's' : ''} failed to sync to server — changes are local only`,
          'UPSERT_FAILED',
        ))
      }, ScheduleSyncService.UPSERT_ERROR_BATCH_MS)
    }
  }

  /**
   * Ensure the rotation and academic year caches are populated.
   */
  private async ensureCaches(): Promise<void> {
    if (!this.rotationIdCache) {
      try {
        const res = await this.client.request<{
          Rotations: { docs: Array<{ id: number; codename: string }> }
        }>(ROTATIONS_QUERY)
        this.rotationIdCache = new Map(res.Rotations.docs.map((r) => [r.codename, r.id]))
      } catch (err) {
        throw new SyncError(
          'Failed to load rotation data from server',
          'CACHE_FAILED',
          err,
        )
      }
    }

    if (!this.ayIdCache) {
      try {
        const res = await this.client.request<{
          AcademicYears: { docs: Array<{ id: number; startingYear: number }> }
        }>(ACADEMIC_YEAR_QUERY, { where: {} })
        this.ayIdCache = new Map(res.AcademicYears.docs.map((ay) => [ay.startingYear, ay.id]))
      } catch (err) {
        throw new SyncError(
          'Failed to load academic year data from server',
          'CACHE_FAILED',
          err,
        )
      }
    }

    if (this.tenantIdCache === undefined) {
      try {
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        })
        if (res.ok) {
          const data = await res.json()
          const firstTenant = data.user?.tenants?.[0]?.tenant
          this.tenantIdCache = firstTenant != null
            ? (typeof firstTenant === 'object' ? (firstTenant.id ?? null) : firstTenant)
            : null
        } else {
          this.tenantIdCache = null
        }
      } catch {
        this.tenantIdCache = null
      }

      // Super-admin fallback: if the user has no tenant assignments, query
      // the API for the first available tenant (super-admins manage all).
      if (this.tenantIdCache == null) {
        try {
          const tenantRes = await this.client.request<{
            Tenants: { docs: Array<{ id: number }> }
          }>(FIRST_TENANT_QUERY)
          this.tenantIdCache = tenantRes.Tenants.docs[0]?.id ?? null
        } catch {
          // Leave as null — creation will rely on the backend hook
        }
      }
    }
  }
}

// ── Singleton instance ──

let _instance: ScheduleSyncService | null = null

export function getScheduleSyncService(): ScheduleSyncService {
  if (!_instance) {
    _instance = new ScheduleSyncService()
  }
  return _instance
}
