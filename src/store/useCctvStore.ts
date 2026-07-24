import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CCTV_RETENTION_DAYS,
  DEFAULT_CCTV_AI_TOGGLES,
  DEFAULT_CCTV_CAMERAS,
  type CctvAiToggles,
  type CctvCamera,
  type CctvRecordingSegment,
  type CctvWalkoutAlert,
  type CctvZoneCategory,
  createLiveRecordingTick,
  groupRecordingsByDay,
  normalizeCamera,
  purgeExpiredRecordings,
  publishCashierAmberAlert,
  publishSecurityAlert,
  seedRecordingArchive,
  simulateFightDetection,
  simulateWalkoutDetection,
} from '../lib/cctvEngine'
import type { PosOrder, PosTableTab } from '../types'

export const CCTV_CAMERA_COUNT = 10

interface CctvState {
  cameras: CctvCamera[]
  recordings: CctvRecordingSegment[]
  alerts: CctvWalkoutAlert[]
  aiToggles: CctvAiToggles
  monitoring: boolean
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
  runRetentionPurge: () => number
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
    const existing = byId.get(fallback.id) || byId.get(`cam_${String(index + 1).padStart(2, '0')}`)
    return existing ? normalizeCamera({ ...fallback, ...existing, id: fallback.id }) : { ...fallback }
  }).slice(0, CCTV_CAMERA_COUNT)
}

export const useCctvStore = create<CctvState>()(
  persist(
    (set, get) => ({
      cameras: DEFAULT_CCTV_CAMERAS.map((c) => ({ ...c })),
      recordings: [],
      alerts: [],
      aiToggles: { ...DEFAULT_CCTV_AI_TOGGLES },
      monitoring: true,
      lastRetentionPurgeAt: null,
      lastPurgedCount: 0,

      ensureCameras: () => {
        const state = get()
        const cameras = migrateCameras(state.cameras)
        const { kept, purgedCount } = purgeExpiredRecordings(state.recordings)
        let recordings = kept
        if (!recordings.length) {
          recordings = seedRecordingArchive(cameras)
        }
        set({
          cameras,
          recordings,
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
              next.zone = patch.zoneCategory as CctvZoneCategory
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

      runRetentionPurge: () => {
        const { kept, purgedCount } = purgeExpiredRecordings(get().recordings)
        set({
          recordings: kept,
          lastRetentionPurgeAt: new Date().toISOString(),
          lastPurgedCount: purgedCount,
        })
        return purgedCount
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
        publishSecurityAlert(hit)
        set((state) => ({
          alerts: [hit, ...state.alerts].slice(0, 40),
          cameras: state.cameras.map((c) =>
            c.id === hit.cameraId ? { ...c, status: 'alert' as const } : c,
          ),
        }))
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
    }),
    {
      name: 'eventflow-cctv-v2',
      partialize: (state) => ({
        cameras: state.cameras,
        recordings: state.recordings,
        alerts: state.alerts,
        aiToggles: state.aiToggles,
        monitoring: state.monitoring,
        lastRetentionPurgeAt: state.lastRetentionPurgeAt,
        lastPurgedCount: state.lastPurgedCount,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.cameras = migrateCameras(state.cameras)
        state.aiToggles = { ...DEFAULT_CCTV_AI_TOGGLES, ...(state.aiToggles || {}) }
        state.alerts = Array.isArray(state.alerts) ? state.alerts : []
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

export { CCTV_RETENTION_DAYS }
