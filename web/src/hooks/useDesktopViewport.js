import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(min-width: 769px)'

function subscribe(callback) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

function getSnapshot() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(DESKTOP_QUERY).matches
}

export function useDesktopViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
