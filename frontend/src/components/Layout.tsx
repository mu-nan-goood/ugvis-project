import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  BarChart3,
  CalendarDays,
  TreePine,
  Database,
  Menu,
  X,
  Sun,
  Moon,
  User,
  LogOut,
  LogIn,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/map', label: '地图', icon: Map },
  { path: '/analysis', label: '空间分析', icon: BarChart3 },
  { path: '/seasonal', label: '季节分析', icon: CalendarDays },
  { path: '/planning', label: '规划决策', icon: TreePine },
  { path: '/data', label: '数据管理', icon: Database },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/auth')
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${darkMode ? 'bg-gray-800' : 'bg-white'} w-64 border-r`}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <h1 className="text-xl font-bold text-primary-600">UGVIS</h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'lg:ml-64' : ''} transition-margin`}>
        {/* Header */}
        <header
          className={`sticky top-0 z-30 h-16 flex items-center justify-between px-4 border-b ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'
          }`}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user ? (
              <>
                <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                  <User className="w-4 h-4" />
                  <span className="font-medium">{user.username}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${{ admin: 'bg-red-100 text-red-700', analyst: 'bg-blue-100 text-blue-700', user: 'bg-gray-200 text-gray-600', guest: 'bg-gray-200 text-gray-600' }}[user.role] ?? 'bg-gray-200 text-gray-600'`}>
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">登录</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
