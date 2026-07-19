import { useEffect, useState } from 'react'

const query = '(max-width: 767px)'

export default function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(query)
    const update = (event) => setIsMobile(event.matches)
    update(media)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}
