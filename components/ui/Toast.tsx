/**
 * Lightweight toast notification system — zero external dependencies.
 *
 * Usage:
 *   1. Wrap your app in <ToastProvider>
 *   2. Call `useToast()` anywhere inside to get `toast`:
 *        toast.success('Saved!')
 *        toast.error('Failed to publish', { action: { label: 'Retry', onClick: retry } })
 *        toast.warning('Changes are local only')
 *        toast.info('Loaded 3 candidates')
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react'

// ── Types ──

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  /** Override auto-dismiss duration in ms. Set 0 to persist until dismissed. */
  duration?: number
  /** Optional action button */
  action?: ToastAction
}

interface ToastEntry {
  id: number
  severity: ToastSeverity
  message: string
  action?: ToastAction
  /** ms before auto-dismiss. 0 = persist. */
  duration: number
  /** Whether dismiss animation is playing */
  exiting: boolean
}

interface ToastAPI {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  warning: (message: string, options?: ToastOptions) => void
  info: (message: string, options?: ToastOptions) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastAPI | null>(null)

// ── Duration defaults per severity ──

const DEFAULT_DURATIONS: Record<ToastSeverity, number> = {
  success: 5_000,
  info: 5_000,
  warning: 8_000,
  error: 0, // persist until dismissed
}

// ── Severity visuals ──

const SEVERITY_CONFIG: Record<
  ToastSeverity,
  {
    Icon: typeof CheckCircle
    bg: string
    border: string
    text: string
    iconColor: string
    progressColor: string
  }
> = {
  success: {
    Icon: CheckCircle,
    bg: '#f0fdf4',
    border: '#bbf7d0',
    text: '#166534',
    iconColor: '#22c55e',
    progressColor: '#22c55e',
  },
  error: {
    Icon: AlertCircle,
    bg: '#fef2f2',
    border: '#fecaca',
    text: '#991b1b',
    iconColor: '#ef4444',
    progressColor: '#ef4444',
  },
  warning: {
    Icon: AlertTriangle,
    bg: '#fffbeb',
    border: '#fed7aa',
    text: '#92400e',
    iconColor: '#f59e0b',
    progressColor: '#f59e0b',
  },
  info: {
    Icon: Info,
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1e40af',
    iconColor: '#3b82f6',
    progressColor: '#3b82f6',
  },
}

// ── Individual Toast component ──

const ToastItem: React.FC<{
  entry: ToastEntry
  onDismiss: (id: number) => void
}> = ({ entry, onDismiss }) => {
  const { Icon, bg, border, text, iconColor, progressColor } =
    SEVERITY_CONFIG[entry.severity]

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '10px',
        padding: '12px 14px',
        color: text,
        fontSize: '13px',
        fontWeight: 500,
        lineHeight: '1.4',
        boxShadow:
          '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        maxWidth: '400px',
        minWidth: '280px',
        pointerEvents: 'auto',
        position: 'relative',
        overflow: 'hidden',
        animation: entry.exiting
          ? 'toast-out 200ms ease-in forwards'
          : 'toast-in 250ms ease-out',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <Icon
        size={18}
        style={{
          color: iconColor,
          flexShrink: 0,
          marginTop: '1px',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ wordBreak: 'break-word' }}>{entry.message}</div>
        {entry.action && (
          <button
            onClick={() => {
              entry.action!.onClick()
              onDismiss(entry.id)
            }}
            style={{
              marginTop: '6px',
              padding: '3px 10px',
              fontSize: '12px',
              fontWeight: 600,
              background: iconColor,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'opacity 150ms',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {entry.action.label}
          </button>
        )}
      </div>

      <button
        onClick={() => onDismiss(entry.id)}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: text,
          opacity: 0.5,
          padding: '2px',
          flexShrink: 0,
          display: 'flex',
          transition: 'opacity 150ms',
        }}
        onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseOut={(e) => (e.currentTarget.style.opacity = '0.5')}
      >
        <X size={14} />
      </button>

      {/* Auto-dismiss progress bar */}
      {entry.duration > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: `${progressColor}20`,
          }}
        >
          <div
            style={{
              height: '100%',
              background: progressColor,
              opacity: 0.5,
              animation: `toast-progress ${entry.duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Provider ──

let _nextId = 1

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  )

  const dismiss = useCallback((id: number) => {
    // Start exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 200)
    // Clear any pending auto-dismiss timer
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const addToast = useCallback(
    (severity: ToastSeverity, message: string, options?: ToastOptions) => {
      const id = _nextId++
      const duration = options?.duration ?? DEFAULT_DURATIONS[severity]

      const entry: ToastEntry = {
        id,
        severity,
        message,
        action: options?.action,
        duration,
        exiting: false,
      }

      setToasts((prev) => {
        // Cap at 5 visible toasts — dismiss oldest if needed
        const next = [...prev, entry]
        if (next.length > 5) {
          const oldest = next[0]
          dismiss(oldest.id)
        }
        return next
      })

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration)
        timersRef.current.set(id, timer)
      }
    },
    [dismiss]
  )

  const api = useRef<ToastAPI>({
    success: (msg, opts) => addToast('success', msg, opts),
    error: (msg, opts) => addToast('error', msg, opts),
    warning: (msg, opts) => addToast('warning', msg, opts),
    info: (msg, opts) => addToast('info', msg, opts),
    dismiss,
  })

  // Keep the ref callbacks in sync with the latest addToast/dismiss
  useEffect(() => {
    api.current.success = (msg, opts) => addToast('success', msg, opts)
    api.current.error = (msg, opts) => addToast('error', msg, opts)
    api.current.warning = (msg, opts) => addToast('warning', msg, opts)
    api.current.info = (msg, opts) => addToast('info', msg, opts)
    api.current.dismiss = dismiss
  }, [addToast, dismiss])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  return (
    <ToastContext.Provider value={api.current}>
      {children}

      {/* Toast container — bottom-right, above everything */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-relevant="additions removals"
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} entry={t} onDismiss={dismiss} />
          ))}
        </div>
      )}

      {/* Keyframes — injected once */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(8px) scale(0.96); }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

// ── Hook ──

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast() must be used inside <ToastProvider>')
  }
  return ctx
}
