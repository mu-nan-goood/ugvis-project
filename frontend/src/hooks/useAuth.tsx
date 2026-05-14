import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { User } from '../types'
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, isAuthenticated } from '../utils/api'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const u = await getMe()
      setUser(u)
    } catch {
      setUser(null)
    }
  }, [])

  // 初始化：检查是否已登录
  useEffect(() => {
    async function init() {
      if (isAuthenticated()) {
        await refreshUser()
      }
      setIsLoading(false)
    }
    init()
  }, [refreshUser])

  const login = useCallback(async (username: string, password: string) => {
    await apiLogin({ username, password })
    await refreshUser()
  }, [refreshUser])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const register = useCallback(async (username: string, email: string, password: string) => {
    await apiRegister({ username, email, password })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        register,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
