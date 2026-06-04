import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
  ChevronLeft,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { path: '/', label: '总览', icon: LayoutDashboard, color: 'text-primary-500' },
  { path: '/map', label: '地图', icon: Map, color: 'text-accent-500' },
  { path: '/analysis', label: '空间分析', icon: BarChart3, color: 'text-info-500' },
  { path: '/seasonal', label: '季节分析', icon: CalendarDays, color: 'text-warning-500' },
  { path: '/planning', label: '规划决策', icon: TreePine, color: 'text-success-500' },
  { path: '/data', label: '数据管理', icon: Database, color: 'text-surface-500' },
]

const sidebarVariants = {
  open: { width: 256 },
  collapsed: { width: 64 },
}

const labelVariants = {
  open: { opacity: 1, x: 0, display: 'block' },
  collapsed: { opacity: 0, x: -8, transitionEnd: { display: 'none' } },
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ugvis-dark') === 'true'
    }
    return false
  })
  const location = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('ugvis-dark', String(darkMode))
  }, [darkMode])

  async function handleLogout() {
    await logout()
    navigate('/auth')
  }

  const roleStyles: Record<string, string> = {
    admin: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300',
    analyst: 'bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-300',
    user: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
    guest: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
  }

  const roleLabels: Record<string, string> = {
    admin: '管理员',
    analyst: '分析师',
    user: '用户',
    guest: '访客',
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 transition-colors duration-300">
      {/* Sidebar */}
      <motion.aside
        className="fixed left-0 top-0 z-40 h-screen bg-white dark:bg-surface-900 border-r border-surface-200/80 dark:border-surface-800 flex flex-col"
        variants={sidebarVariants}
        animate={sidebarOpen ? 'open' : 'collapsed'}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Sidebar Header */}
        <div className="flex h-14 items-center justify-between px-3 border-b border-surface-200/80 dark:border-surface-800 flex-shrink-0">
          <AnimatePresence mode="wait">
            {sidebarOpen && (
              <motion.div
                key="brand"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lift">
                  <TreePine className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-surface-900 dark:text-surface-50 tracking-tight leading-none">
                    UGVIS
                  </h1>
                  <p className="text-2xs text-surface-400 dark:text-surface-500 leading-none mt-0.5">
                    城市绿视率系统
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mx-auto"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lift">
                <TreePine className="w-4.5 h-4.5 text-white" />
              </div>
            </motion.div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`absolute top-3 p-1.5 rounded-lg text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors z-10 ${
              sidebarOpen ? 'right-3' : 'right-1/2 translate-x-1/2'
            }`}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${!sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 p-2 space-y-0.5 mt-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                title={sidebarOpen ? undefined : item.label}
                className={`group relative flex items-center gap-3 rounded-xl transition-all duration-150 ${
                  sidebarOpen ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'
                } ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium'
                    : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary-500"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? item.color : ''}`} />
                <motion.span
                  variants={labelVariants}
                  animate={sidebarOpen ? 'open' : 'collapsed'}
                  transition={{ duration: 0.15 }}
                  className="text-sm whitespace-nowrap overflow-hidden"
                >
                  {item.label}
                </motion.span>
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-surface-200/80 dark:border-surface-800">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`flex items-center gap-3 rounded-xl transition-colors ${
              sidebarOpen ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'
            } text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 w-full`}
          >
            <motion.div
              key={darkMode ? 'moon' : 'sun'}
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </motion.div>
            <motion.span
              variants={labelVariants}
              animate={sidebarOpen ? 'open' : 'collapsed'}
              transition={{ duration: 0.15 }}
              className="text-sm"
            >
              {darkMode ? '亮色模式' : '暗色模式'}
            </motion.span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <motion.div
        className="transition-[margin] duration-300"
        animate={{ marginLeft: sidebarOpen ? 256 : 64 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-white/80 dark:bg-surface-900/80 backdrop-blur-xl border-b border-surface-200/60 dark:border-surface-800/60">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Breadcrumb / Page title */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-sm text-surface-400">UGVIS</span>
            <span className="text-surface-300">/</span>
            <span className="text-sm font-medium text-surface-700 dark:text-surface-200">
              {navItems.find(i => i.path === location.pathname)?.label ?? '页面'}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Mobile dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="lg:hidden p-2 rounded-xl text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200/60 dark:border-surface-700/60">
                  <div className="w-6 h-6 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <span className="font-medium text-surface-700 dark:text-surface-200">{user.username}</span>
                  <span className={`text-2xs font-medium px-1.5 py-0.5 rounded-md ${roleStyles[user.role] ?? roleStyles.guest}`}>
                    {roleLabels[user.role] ?? user.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-surface-500 hover:text-danger-600 dark:hover:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-xl transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">退出</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-colors font-medium"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">登录</span>
              </Link>
            )}
          </div>
        </header>

        {/* Page Content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="p-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
