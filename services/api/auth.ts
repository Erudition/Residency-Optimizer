/**
 * Authentication utilities for the frontend ↔ backend sync.
 *
 * In production (same origin), Payload's httpOnly cookie carries over.
 * In development (cross-origin), the Payload admin's "Launch Scheduler"
 * link passes a JWT via URL parameter. We extract it, store it in memory,
 * and strip it from the address bar.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const AUTH_TOKEN_KEY = 'rsp_auth_token'

// Eagerly load token from localStorage so auth persists across page refreshes.
let _token: string | null = (() => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
})()

/**
 * On app load, check for a `?token=` URL parameter (set by the
 * Payload admin's "Launch Scheduler" redirect). If found, store
 * it in memory and strip it from the address bar.
 */
export function extractTokenFromURL(): void {
  const params = new URLSearchParams(window.location.search)
  const urlToken = params.get('token')
  if (urlToken) {
    _token = urlToken
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, urlToken)
    } catch {
      // localStorage unavailable (private browsing, etc.) — in-memory only
    }
    // Strip the token from the URL without triggering a navigation
    params.delete('token')
    const cleanURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`
    window.history.replaceState({}, '', cleanURL)
    console.log('[Auth] Token extracted from URL')
  }
}

/**
 * Set the auth token programmatically (e.g., after a login flow).
 */
export function setToken(token: string | null): void {
  _token = token
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // localStorage unavailable — in-memory only
  }
}

/**
 * Get the current token, if any.
 */
export function getToken(): string | null {
  return _token
}

/**
 * Check if the user is authenticated (has a token).
 */
export function isAuthenticated(): boolean {
  return _token !== null
}

/**
 * Returns authorization headers if a token is available.
 * Use this in GraphQL clients and fetch calls.
 */
export function getAuthHeaders(): Record<string, string> {
  if (!_token) return {}
  return { Authorization: `JWT ${_token}` }
}

/**
 * Verify the current token by calling /api/users/me.
 * Returns user info if valid, null if invalid/expired.
 */
export async function verifyToken(): Promise<{
  id: number
  email: string
  name?: string
} | null> {
  if (!_token) return null

  try {
    const res = await fetch(`${API_URL}/api/users/me`, {
      headers: { Authorization: `JWT ${_token}` },
    })
    if (!res.ok) {
      setToken(null)
      return null
    }
    const data = await res.json()
    if (!data.user) {
      setToken(null)
      return null
    }
    return data.user
  } catch {
    setToken(null)
    return null
  }
}
