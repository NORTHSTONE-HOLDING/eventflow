import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CCTV_RETENTION_DAYS,
  CCTV_SUGGESTED_CUSTOM_ZONES,
  CCTV_ZONE_OPTIONS,
  DEFAULT_CCTV_AI_TOGGLES,
  DEFAULT_CCTV_CAMERAS,
  type CctvAiToggles,
  type CctvCamera,
  type CctvEventLogEntry,
  type CctvGlobalAlert,
  type CctvRecordingSegment,
  type CctvWalkoutAlert,
  type CctvZoneCategory,
  buildForcedTheftAlertMessage,
  createLiveRecordingTick,
  groupRecordingsByDay,
  groupRecordingsTimeline,
  normalizeCamera,
  normalizeRecordingSegment,
  playSecurityAlarmSound,
  publishCashierAmberAlert,
  publishSecurityAlert,
  purgeExpiredRecordings,
  resolveTheftTargetTable,
  seedRecordingArchive,
  simulateFightDetection,
  simulateWalkoutDetection,
} from '../lib/cctvEngine'
import { uid } from '../lib/documentIds'
import type { PosOrder, PosTableTab } from '../types'
import { usePosSessionStore } from './usePosSessionStore'
import { useAppStore } from './useAppStore'

export const CCTV_CAMERA_COUNT = 10

interface CctvState {
  cameras: CctvCamera[]
  recordings: CctvRecordingSegment[]
  alerts: CctvWalkoutAlert[]
  eventLog: CctvEventLogEntry[]
  customZones: string[]
  aiToggles: CctvAiToggles
  monitoring: boolean
  flashingCameraId: string | null
  theftSimRunning: boolean
  globalAlert: CctvGlobalAlert | null
  lastRetentionPurgeAt: string | null
  lastPurgedCount: number
  ensureCameras: () => void
  setMonitoring: (value: boolean) => void
  updateCamera: (
    cameraId: string,
    patch: Partial<
      Pick<
        CctvCamera,
        | 'label'
        | 'zone'
        | 'zoneCategory'
        | 'rtspUrl'
        | 'status'
        | 'recording'
        | 'linkedTableLabels'
      >
    >,
  ) => void
  setCameraStatus: (cameraId: string, status: CctvCamera['status']) => void
  setAiToggle: (key: keyof CctvAiToggles, value: boolean) => void
  addCustomZone: (zone: string) => boolean
  getZoneRegistry: () => string[]
  runRetentionPurge: () => number
  pushEventLog: (entry: Omit<CctvEventLogEntry, 'id' | 'createdAt'> & { createdAt?: string }) => void
  clearEventLog: () => void
  dismissGlobalAlert: () => void
  /** Interactive 3s theft sequence — Camera 01 + system-wide alarm */
  runTheftSimulation: (opts: {
    tables: PosTableTab[]
    orders: PosOrder[]
    projectId: string
  }) => Promise<CctvWalkoutAlert | null>
  runWalkoutSimulation: (opts: {
    tables: PosTableTab[]
    orders: PosOrder[]
    projectId: string
  }) => CctvWalkoutAlert | null
  runFightSimulation: () => CctvWalkoutAlert | null
  acknowledgeAlert: (alertId: string) => void
  clearAcknowledged: () => void
  seedDemoArchiveIfEmpty: () => void
  appendLiveRecordingTicks: () => void
  getArchiveByDay: () => ReturnType<typeof groupRecordingsByDay>
  getArchiveTimeline: () => ReturnType<typeof groupRecordingsTimeline>
}

function migrateCameras(raw: unknown): CctvCamera[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_CCTV_CAMERAS.map((c) => ({ ...c }))
  }
  const byId = new Map(
    raw
      .filter((item): item is Partial<CctvCamera> & { id: string } =>
        Boolean(item && typeof item === 'object' && 'id' in item),
      )
      .map((item) => [item.id, normalizeCamera(item)]),
  )
  return DEFAULT_CCTV_CAMERAS.map((fallback, index) => {
    const existing =
      byId.get(fallback.id) || byId.get(`cam_${String(index + 1).padStart(2, '0')}`)
    return existing
      ? normalizeCamera({ ...fallback, ...existing, id: fallback.id })
      : { ...fallback }
  }).slice(0, CCTV_CAMERA_COUNT)
}

function migrateRecordings(raw: unknown): CctvRecordingSegment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Partial<CctvRecordingSegment> & { id: string; cameraId: string; createdAt: string } =>
      Boolean(item && typeof item === 'object' && 'id' in item && 'cameraId' in item && 'createdAt' in item),
    )
    .map((item) => normalizeRecordingSegment(item))
}

let theftTimerIds: number[] = []

function clearTheftTimers() {
  for (const id of theftTimerIds) window.clearTimeout(id)
  theftTimerIds = []
}

export const useCctvStore = create<CctvState>()(
  persist(
    (set, get) => ({
      cameras: DEFAULT_CCTV_CAMERAS.map((c) => ({ ...c })),
      recordings: [],
      alerts: [],
      eventLog: [],
      customZones: [...CCTV_SUGGESTED_CUSTOM_ZONES],
      aiToggles: { ...DEFAULT_CCTV_AI_TOGGLES },
      monitoring: true,
      flashingCameraId: null,
      theftSimRunning: false,
      globalAlert: null,
      lastRetentionPurgeAt: null,
      lastPurgedCount: 0,

      ensureCameras: () => {
        const state = get()
        const cameras = migrateCameras(state.cameras)
        const normalized = migrateRecordings(state.recordings)
        const { kept, purgedCount } = purgeExpiredRecordings(normalized)
        let recordings = kept
        if (!recordings.length) {
          recordings = seedRecordingArchive(cameras)
        }
        set({
          cameras,
          recordings,
          customZones: Array.isArray(state.customZones)
            ? state.customZones
            : [...CCTV_SUGGESTED_CUSTOM_ZONES],
          lastRetentionPurgeAt: new Date().toISOString(),
          lastPurgedCount: purgedCount,
        })
      },

      setMonitoring: (value) => set({ monitoring: value }),

      updateCamera: (cameraId, patch) => {
        set((state) => ({
          cameras: state.cameras.map((camera) => {
            if (camera.id !== cameraId) return camera
            const next: CctvCamera = { ...camera, ...patch }
            if (typeof patch.rtspUrl === 'string') {
              const trimmed = patch.rtspUrl.trim()
              next.rtspUrl = trimmed
              if (trimmed.length > 0 && !patch.status) {
                next.status = 'online'
                next.recording = patch.recording ?? true
              }
              if (trimmed.length === 0 && !patch.status) {
                next.status = 'offline'
                next.recording = false
              }
            }
            if (patch.zoneCategory && !patch.zone) {
              next.zone = patch.zoneCategory
            }
            return next
          }),
        }))
      },

      setCameraStatus: (cameraId, status) => {
        set((state) => ({
          cameras: state.cameras.map((camera) =>
            camera.id === cameraId
              ? {
                  ...camera,
                  status,
                  recording: status === 'online' ? true : false,
                }
              : camera,
          ),
        }))
      },

      setAiToggle: (key, value) => {
        set((state) => ({
          aiToggles: { ...state.aiToggles, [key]: value },
        }))
      },

      addCustomZone: (zone) => {
        const cleaned = zone.trim()
        if (!cleaned) return false
        const registry = get().getZoneRegistry()
        if (registry.some((z) => z.toLowerCase() === cleaned.toLowerCase())) {
          return false
        }
        set((state) => ({
          customZones: [...state.customZones, cleaned],
        }))
        return true
      },

      getZoneRegistry: () => {
        const custom = get().customZones ?? []
        const merged = [...CCTV_ZONE_OPTIONS, ...custom]
        const seen = new Set<string>()
        return merged.filter((z) => {
          const key = z.toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      },

      runRetentionPurge: () => {
        const { kept, purgedCount } = purgeExpiredRecordings(get().recordings)
        set({
          recordings: kept,
          lastRetentionPurgeAt: new Date().toISOString(),
          lastPurgedCount: purgedCount,
        })
        return purgedCount
      },

      pushEventLog: (entry) => {
        const row: CctvEventLogEntry = {
          id: uid('evt'),
          createdAt: entry.createdAt || new Date().toISOString(),
          level: entry.level,
          message: entry.message,
          cameraId: entry.cameraId,
          tableLabel: entry.tableLabel,
        }
        set((state) => ({
          eventLog: [row, ...state.eventLog].slice(0, 80),
        }))
      },

      clearEventLog: () => set({ eventLog: [] }),

      dismissGlobalAlert: () => set({ globalAlert: null }),

      runTheftSimulation: async ({ tables, orders, projectId }) => {
        if (get().theftSimRunning) return null
        clearTheftTimers()

        const target = resolveTheftTargetTable(tables, orders)
        const cam01 =
          get().cameras.find((c) => c.id === 'cam_01') ||
          get().cameras[0]
        if (!cam01) return null

        // Force walkout AI on for interactive demo
        if (!get().aiToggles.walkoutDetection) {
          set((s) => ({ aiToggles: { ...s.aiToggles, walkoutDetection: true } }))
        }
        if (!get().monitoring) set({ monitoring: true })

        set({
          theftSimRunning: true,
          flashingCameraId: cam01.id,
          cameras: get().cameras.map((c) =>
            c.id === cam01.id
              ? { ...c, status: 'alert' as const, recording: true }
              : c,
          ),
        })

        get().pushEventLog({
          level: 'warn',
          message: `🧪 Simulace útěku spuštěna — ${cam01.label} (Kamera 01) bliká`,
          cameraId: cam01.id,
          tableLabel: target.tableLabel,
        })

        return await new Promise<CctvWalkoutAlert | null>((resolve) => {
          theftTimerIds.push(
            window.setTimeout(() => {
              get().pushEventLog({
                level: 'warn',
                message:
                  'AI Vision: detekce rychlého pohybu od stolu směrem k hlavnímu východu…',
                cameraId: cam01.id,
                tableLabel: target.tableLabel,
              })
            }, 1000),
          )

          theftTimerIds.push(
            window.setTimeout(() => {
              const message = buildForcedTheftAlertMessage(3)
              const alert: CctvWalkoutAlert = {
                id: uid('cctv'),
                cameraId: cam01.id,
                cameraLabel: cam01.label,
                tableId: target.tableId,
                tableLabel: 'STŮL 3',
                projectId: projectId || 'sim',
                orderIds: target.orderIds,
                message,
                createdAt: new Date().toISOString(),
                acknowledged: false,
                kind: 'walkout',
              }

              const globalAlert: CctvGlobalAlert = {
                id: alert.id,
                message: alert.message,
                tableLabel: alert.tableLabel,
                cameraId: alert.cameraId,
                cameraLabel: alert.cameraLabel,
                createdAt: alert.createdAt,
                kind: 'walkout',
              }

              // Set globalAlert first so same-tab banners can short-circuit BC echo
              set((state) => ({
                alerts: [alert, ...state.alerts].slice(0, 40),
                globalAlert,
                theftSimRunning: false,
                flashingCameraId: cam01.id,
                eventLog: [
                  {
                    id: uid('evt'),
                    createdAt: new Date().toISOString(),
                    level: 'alarm' as const,
                    message,
                    cameraId: cam01.id,
                    tableLabel: 'STŮL 3',
                  },
                  ...state.eventLog,
                ].slice(0, 80),
              }))

              publishSecurityAlert(alert)

              try {
                usePosSessionStore.getState().pushSecurityAlert({
                  message: alert.message,
                  tableLabel: alert.tableLabel,
                })
              } catch {
                // store may be unavailable in exotic contexts
              }

              try {
                useAppStore.getState().setToast(alert.message)
              } catch {
                // ignore
              }

              playSecurityAlarmSound()

              // Keep red flash a bit longer, then settle to alert status without pulse flag
              theftTimerIds.push(
                window.setTimeout(() => {
                  set({ flashingCameraId: null })
                }, 5000),
              )

              resolve(alert)
            }, 3000),
          )
        })
      },

      runWalkoutSimulation: ({ tables, orders, projectId }) => {
        const { cameras, aiToggles, monitoring } = get()
        if (!monitoring || !aiToggles.walkoutDetection) return null
        const hit = simulateWalkoutDetection({
          cameras,
          tables,
          orders,
          projectId,
        })
        if (!hit) return null
        const globalAlert: CctvGlobalAlert = {
          id: hit.id,
          message: hit.message,
          tableLabel: hit.tableLabel,
          cameraId: hit.cameraId,
          cameraLabel: hit.cameraLabel,
          createdAt: hit.createdAt,
          kind: hit.kind,
        }
        set((state) => ({
          alerts: [hit, ...state.alerts].slice(0, 40),
          globalAlert,
          flashingCameraId: hit.cameraId,
          cameras: state.cameras.map((c) =>
            c.id === hit.cameraId ? { ...c, status: 'alert' as const } : c,
          ),
          eventLog: [
            {
              id: uid('evt'),
              createdAt: new Date().toISOString(),
              level: 'alarm' as const,
              message: hit.message,
              cameraId: hit.cameraId,
              tableLabel: hit.tableLabel,
            },
            ...state.eventLog,
          ].slice(0, 80),
        }))
        publishSecurityAlert(hit)
        playSecurityAlarmSound()
        try {
          usePosSessionStore.getState().pushSecurityAlert({
            message: hit.message,
            tableLabel: hit.tableLabel,
          })
        } catch {
          // ignore
        }
        window.setTimeout(() => set({ flashingCameraId: null }), 5000)
        return hit
      },

      runFightSimulation: () => {
        const { cameras, aiToggles, monitoring } = get()
        if (!monitoring || !aiToggles.fightDetection) return null
        const hit = simulateFightDetection(cameras)
        if (!hit) return null
        publishCashierAmberAlert({
          message: hit.message,
          cameraId: hit.cameraId,
          cameraLabel: hit.cameraLabel,
        })
        publishSecurityAlert(hit)
        set((state) => ({
          alerts: [hit, ...state.alerts].slice(0, 40),
          cameras: state.cameras.map((c) =>
            c.id === hit.cameraId ? { ...c, status: 'alert' as const } : c,
          ),
          eventLog: [
            {
              id: uid('evt'),
              createdAt: new Date().toISOString(),
              level: 'warn' as const,
              message: hit.message,
              cameraId: hit.cameraId,
              tableLabel: hit.tableLabel,
            },
            ...state.eventLog,
          ].slice(0, 80),
        }))
        return hit
      },

      acknowledgeAlert: (alertId) => {
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === alertId ? { ...a, acknowledged: true } : a,
          ),
          cameras: state.cameras.map((c) =>
            c.status === 'alert' ? { ...c, status: 'online' as const } : c,
          ),
          globalAlert:
            state.globalAlert?.id === alertId ? null : state.globalAlert,
          flashingCameraId: null,
        }))
      },

      clearAcknowledged: () => {
        set((state) => ({
          alerts: state.alerts.filter((a) => !a.acknowledged),
        }))
      },

      seedDemoArchiveIfEmpty: () => {
        const { cameras, recordings } = get()
        if (recordings.length > 0) return
        set({ recordings: seedRecordingArchive(cameras) })
      },

      appendLiveRecordingTicks: () => {
        const { cameras, recordings } = get()
        const ticks = cameras
          .filter((c) => c.status !== 'offline' && c.recording)
          .map((c) => createLiveRecordingTick(c))
        if (!ticks.length) return
        const merged = [...ticks, ...recordings]
        const { kept, purgedCount } = purgeExpiredRecordings(merged)
        set({
          recordings: kept.slice(0, 500),
          lastRetentionPurgeAt: new Date().toISOString(),
          lastPurgedCount: purgedCount,
        })
      },

      getArchiveByDay: () => groupRecordingsByDay(get().recordings),
      getArchiveTimeline: () => groupRecordingsTimeline(get().recordings),
    }),
    {
      name: 'eventflow-cctv-v3',
      partialize: (state) => ({
        cameras: state.cameras,
        recordings: state.recordings,
        alerts: state.alerts,
        eventLog: state.eventLog.slice(0, 40),
        customZones: state.customZones,
        aiToggles: state.aiToggles,
        monitoring: state.monitoring,
        lastRetentionPurgeAt: state.lastRetentionPurgeAt,
        lastPurgedCount: state.lastPurgedCount,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.cameras = migrateCameras(state.cameras)
        state.recordings = migrateRecordings(state.recordings)
        state.aiToggles = { ...DEFAULT_CCTV_AI_TOGGLES, ...(state.aiToggles || {}) }
        state.alerts = Array.isArray(state.alerts) ? state.alerts : []
        state.eventLog = Array.isArray(state.eventLog) ? state.eventLog : []
        state.customZones = Array.isArray(state.customZones)
          ? state.customZones
          : [...CCTV_SUGGESTED_CUSTOM_ZONES]
        state.flashingCameraId = null
        state.theftSimRunning = false
        state.globalAlert = null
        const { kept, purgedCount } = purgeExpiredRecordings(state.recordings ?? [])
        state.recordings = kept
        if (purgedCount > 0) {
          state.lastRetentionPurgeAt = new Date().toISOString()
          state.lastPurgedCount = purgedCount
        }
        if (!state.recordings.length) {
          state.recordings = seedRecordingArchive(state.cameras)
        }
      },
    },
  ),
)

export type { CctvZoneCategory }
export { CCTV_RETENTION_DAYS }
