import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, title, onClose, children, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`card w-full ${maxWidth} animate-fadeUp p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-2xl text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 transition hover:text-white"
              aria-label="Zavřít"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
