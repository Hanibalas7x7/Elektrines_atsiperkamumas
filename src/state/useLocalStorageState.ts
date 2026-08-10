import { useEffect, useState } from 'react'

/**
 * Persists state to localStorage under the given key, initializing from any stored value.
 * Stored values are shallow-merged onto the default value so that fields added to the shape
 * after a user already has persisted data (migrations) fall back to their default instead of
 * becoming `undefined`.
 */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (!stored) return defaultValue
      const parsed = JSON.parse(stored) as T
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { ...defaultValue, ...parsed }
      }
      return parsed
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // localStorage may be unavailable (e.g. private browsing) - ignore persistence failures.
    }
  }, [key, value])

  return [value, setValue]
}
