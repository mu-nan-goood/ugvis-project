import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** 允许的角色列表，默认所有已登录用户 */
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">加载中...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // 记录原本想去哪里，登录后可以跳转回来
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-6xl">🚫</div>
        <h2 className="text-xl font-semibold text-gray-800">权限不足</h2>
        <p className="text-gray-500">
          您的角色是「{user.role}」，无法访问此页面。
        </p>
        <a href="/" className="text-primary-600 hover:underline">
          返回首页
        </a>
      </div>
    )
  }

  return <>{children}</>
}
