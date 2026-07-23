import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Default manager PIN for unlocking admin dashboard from staff terminal. */
export const DEFAULT_MANAGER_PIN = '2580'

interface StaffLockState {
  /** When true, any non-/pos-terminal route requires Manager PIN. */
  staffTerminalLocked: boolean
  /** Temporary admin unlock after successful PIN (session). */
  adminUnlocked: boolean
  /** PIN stored locally (overridable from agency profile). */
  managerPin: string
  /** Pending navigation target after PIN success. */
  pendingPath: string | null

  lockStaffTerminal: () => void
  unlockWithPin: (pin: string, expectedPin?: string) => boolean
  setManagerPin: (pin: string) => void
  setPendingPath: (path: string | null) => void
  clearAdminUnlock: () => void
}

export const useStaffLockStore = create<StaffLockState>()(
  persist(
    (set, get) => ({
      staffTerminalLocked: false,
      adminUnlocked: false,
      managerPin: DEFAULT_MANAGER_PIN,
      pendingPath: null,

      lockStaffTerminal: () =>
        set({
          staffTerminalLocked: true,
          adminUnlocked: false,
        }),

      unlockWithPin: (pin, expectedPin) => {
        const expected = (expectedPin || get().managerPin || DEFAULT_MANAGER_PIN).trim()
        const ok = pin.trim() === expected
        if (ok) {
          set({
            staffTerminalLocked: false,
            adminUnlocked: true,
            pendingPath: null,
          })
        }
        return ok
      },

      setManagerPin: (pin) => {
        const cleaned = pin.replace(/\D/g, '').slice(0, 8)
        if (cleaned.length >= 4) set({ managerPin: cleaned })
      },

      setPendingPath: (path) => set({ pendingPath: path }),

      clearAdminUnlock: () => set({ adminUnlocked: false }),
    }),
    {
      name: 'eventflow-staff-lock',
      partialize: (s) => ({
        staffTerminalLocked: s.staffTerminalLocked,
        managerPin: s.managerPin,
        // adminUnlocked intentionally NOT persisted — expires on reload into staff mode
      }),
    }
  )
)
