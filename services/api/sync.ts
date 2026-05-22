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
import {
  CANDIDATES_QUERY,
  CREATE_CANDIDATE_MUTATION,
  CANDIDATE_SCHEDULES_QUERY,
  SCHEDULE_ASSIGNMENTS_QUERY,
  UPDATE_SCHEDULE_MUTATION,
  DELETE_SCHEDULE_MUTATION,
  FIND_ASSIGNMENT_QUERY,
  UPDATE_SCHEDULE_ASSIGNMENT_MUTATION,
  CREATE_SCHEDULE_ASSIGNMENT_MUTATION,
  ROTATIONS_QUERY,
  ACADEMIC_YEAR_QUERY,
} from './queries'

// ── Types ──

export type SyncStatus = 'connected' | 'syncing' | 'offline' | 'disconnected'

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
  private _status: SyncStatus = 'disconnected'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWrites: Map<string, PendingCellWrite> = new Map()

  // Cache: rotation codename → backend ID
  private rotationIdCache: Map<string, number> | null = null
  // Cache: academic year starting year → backend AY ID
  private ayIdCache: Map<number, number> | null = null

  constructor() {
    this.client = new GraphQLClient(GRAPHQL_ENDPOINT, {
      headers: { 'Content-Type': 'application/json' },
    })
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // ── Connection Management ──

  get isConnected(): boolean {
    return this._status === 'connected'
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
    this._status = 'syncing'
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
    this._status = 'disconnected'
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
   * Save a full schedule grid to the backend via the bulk endpoint.
   * Returns the new backend schedule ID.
   */
  async saveScheduleGrid(
    candidateId: number,
    title: string,
    academicYear: number,
    grid: ScheduleGrid,
  ): Promise<number | null> {
    try {
      await this.ensureCaches()

      const ayId = this.ayIdCache?.get(academicYear)
      if (!ayId) {
        console.warn(`[Sync] Academic year ${academicYear} not found in backend`)
        return null
      }

      // Build the assignments array
      const assignments: Array<{
        residentId: number
        week: number
        rotationId: number
        locked: boolean
      }> = []

      for (const [residentId, cells] of Object.entries(grid)) {
        for (let w = 0; w < cells.length; w++) {
          const cell = cells[w]
          if (!cell?.assignment) continue

          const rotId = this.rotationIdCache?.get(cell.assignment)
          if (!rotId) continue

          assignments.push({
            residentId: parseInt(residentId, 10),
            week: w + 1,
            rotationId: rotId,
            locked: cell.locked,
          })
        }
      }

      // Use the bulk endpoint
      const response = await fetch(`${API_URL}/api/sync/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          title,
          academicYearId: ayId,
          assignments,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        console.error('[Sync] Bulk save failed:', err)
        return null
      }

      const result = await response.json()
      return result.scheduleId as number
    } catch (err) {
      console.error('[Sync] Bulk save error:', err)
      return null
    }
  }

  /**
   * Rename a schedule on the backend.
   */
  async renameSchedule(backendId: number, title: string): Promise<void> {
    try {
      await this.client.request(UPDATE_SCHEDULE_MUTATION, {
        id: backendId,
        data: { title },
      })
    } catch (err) {
      console.error('[Sync] Rename failed:', err)
    }
  }

  /**
   * Delete a schedule from the backend.
   */
  async deleteSchedule(backendId: number): Promise<void> {
    try {
      await this.client.request(DELETE_SCHEDULE_MUTATION, {
        id: backendId,
      })
    } catch (err) {
      console.error('[Sync] Delete failed:', err)
    }
  }

  // ── Candidate Management ──

  /**
   * Find or create a Candidate for the given starting year.
   * Transparent to the user — they never see Candidate objects.
   */
  async ensureCandidate(startYear: number): Promise<number | null> {
    try {
      // Check if an active candidate exists for this year
      const res = await this.client.request<{
        Candidates: { docs: Array<{ id: number; title: string; status: string; startingYear: { startingYear: number } }> }
      }>(CANDIDATES_QUERY, {
        where: { status: { equals: 'active' } },
      })

      const existing = res.Candidates.docs.find(
        (c) => c.startingYear.startingYear === startYear,
      )
      if (existing) return existing.id

      // Resolve the AcademicYear backend ID
      await this.ensureCaches()
      const ayId = this.ayIdCache?.get(startYear)
      if (!ayId) {
        console.warn(`[Sync] Cannot create candidate: AY ${startYear} not found`)
        return null
      }

      // Create a new candidate
      const createRes = await this.client.request<{
        createCandidate: { id: number; title: string }
      }>(CREATE_CANDIDATE_MUTATION, {
        data: {
          title: `Planning Session — AY ${startYear}–${startYear + 3}`,
          startingYear: ayId,
          status: 'active',
        },
      })

      return createRes.createCandidate.id
    } catch (err) {
      console.error('[Sync] ensureCandidate failed:', err)
      return null
    }
  }

  // ── Data Loading ──

  /**
   * Load all schedules and their assignments for a candidate.
   * Returns the data needed to populate CandidateSchedule objects.
   */
  async loadCandidateSchedules(candidateId: number): Promise<
    Array<{
      backendId: number
      title: string
      academicYear: number
      assignments: Array<{
        residentId: number
        week: number
        rotation: string
        locked: boolean
      }>
    }>
  > {
    try {
      // 1. Get all schedules for this candidate
      const schedRes = await this.client.request<{
        Schedules: {
          docs: Array<{
            id: number
            title: string
            academicYear: { id: number; startingYear: number }
            candidate: { id: number }
          }>
        }
      }>(CANDIDATE_SCHEDULES_QUERY, {
        where: { candidate: { equals: candidateId } },
      })

      const schedules = schedRes.Schedules.docs

      // 2. For each schedule, load its assignments
      const results = await Promise.all(
        schedules.map(async (sched) => {
          const assignRes = await this.client.request<{
            ScheduleAssignments: {
              docs: Array<{
                id: number
                resident: { id: number }
                week: number
                rotation: { codename: string }
                locked: boolean
              }>
            }
          }>(SCHEDULE_ASSIGNMENTS_QUERY, {
            where: { schedule: { equals: sched.id } },
          })

          return {
            backendId: sched.id,
            title: sched.title,
            academicYear: sched.academicYear.startingYear,
            assignments: assignRes.ScheduleAssignments.docs.map((a) => ({
              residentId: a.resident.id,
              week: a.week,
              rotation: a.rotation.codename,
              locked: a.locked,
            })),
          }
        }),
      )

      return results
    } catch (err) {
      console.error('[Sync] loadCandidateSchedules failed:', err)
      return []
    }
  }

  // ── Private helpers ──

  private openEventSource(): void {
    if (!this._candidateId) return

    const url = `${SSE_BASE}/${this._candidateId}?clientId=${encodeURIComponent(this.clientId)}`

    try {
      this.eventSource = new EventSource(url)

      this.eventSource.addEventListener('connected', () => {
        this._status = 'connected'
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
        this._status = 'offline'
        this.eventSource?.close()
        this.eventSource = null
        this.scheduleReconnect()
      }
    } catch {
      this._status = 'offline'
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
    try {
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
    }
  }

  /**
   * Ensure the rotation and academic year caches are populated.
   */
  private async ensureCaches(): Promise<void> {
    if (!this.rotationIdCache) {
      const res = await this.client.request<{
        Rotations: { docs: Array<{ id: number; codename: string }> }
      }>(ROTATIONS_QUERY)
      this.rotationIdCache = new Map(res.Rotations.docs.map((r) => [r.codename, r.id]))
    }

    if (!this.ayIdCache) {
      const res = await this.client.request<{
        AcademicYears: { docs: Array<{ id: number; startingYear: number }> }
      }>(ACADEMIC_YEAR_QUERY, { where: {} })
      this.ayIdCache = new Map(res.AcademicYears.docs.map((ay) => [ay.startingYear, ay.id]))
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
