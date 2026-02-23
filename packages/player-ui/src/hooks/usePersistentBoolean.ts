import { useEffect, useState } from 'react'

export function usePersistentBoolean(key: string, defaultValue = false) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored === null ? defaultValue : stored === 'true'
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value))
    } catch {
      // ignore
    }
  }, [key, value])

  return [value, setValue] as const
}
