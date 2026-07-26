import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TerminalProvider } from '../lib/terminalHandshake'
import { uid } from '../lib/documentIds'

export interface PaymentTerminalLog {
  id: string
  at: string
  provider: TerminalProvider
  amountCzk: number
  approved: boolean
  authCode?: string
  message: string
  kind: 'handshake_test' | 'live'
}

interface PaymentTerminalState {
  provider: TerminalProvider
  apiKeyMasked: string
  connected: boolean
  lastHandshakeAt: string | null
  logs: PaymentTerminalLog[]

  setProvider: (provider: TerminalProvider) => void
  setApiKey: (raw: string) => void
  setConnected: (connected: boolean) => void
  pushLog: (entry: Omit<PaymentTerminalLog, 'id' | 'at'> & { at?: string }) => void
  clearLogs: () => void
}

function maskKey(raw: string): string {
  const key = String(raw || '').trim()
  if (!key) return ''
  if (key.length <= 6) return '••••••'
  return `${'•'.repeat(Math.min(18, key.length - 4))}${key.slice(-4)}`
}

export const usePaymentTerminalStore = create<PaymentTerminalState>()(
  persist(
    (set) => ({
      provider: 'stripe_terminal',
      apiKeyMasked: '',
      connected: false,
      lastHandshakeAt: null,
      logs: [],

      setProvider: (provider) => set({ provider }),

      setApiKey: (raw) =>
        set({
          apiKeyMasked: maskKey(raw),
          connected: Boolean(String(raw || '').trim()),
        }),

      setConnected: (connected) => set({ connected }),

      pushLog: (entry) =>
        set((s) => ({
          logs: [
            {
              id: uid('paylog'),
              at: entry.at || new Date().toISOString(),
              provider: entry.provider,
              amountCzk: entry.amountCzk,
              approved: entry.approved,
              authCode: entry.authCode,
              message: entry.message,
              kind: entry.kind,
            },
            ...s.logs,
          ].slice(0, 80),
          lastHandshakeAt: new Date().toISOString(),
        })),

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'eventflow-payment-terminal',
      partialize: (s) => ({
        provider: s.provider,
        apiKeyMasked: s.apiKeyMasked,
        connected: s.connected,
        lastHandshakeAt: s.lastHandshakeAt,
        logs: s.logs,
      }),
    },
  ),
)
