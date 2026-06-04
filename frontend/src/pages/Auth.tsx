import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TreePine } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('请填写用户名和密码')
      return
    }

    if (!isLogin) {
      if (!email.trim()) {
        setError('请填写邮箱')
        return
      }
      if (password !== confirmPassword) {
        setError('两次密码不一致')
        return
      }
      if (password.length < 8) {
        setError('密码至少8位，需包含大小写字母、数字和特殊字符')
        return
      }
    }

    setLoading(true)
    try {
      if (isLogin) {
        await login(username, password)
        navigate('/')
      } else {
        await register(username, email, password)
        setError('')
        setIsLogin(true)
        setPassword('')
        setConfirmPassword('')
        alert('注册成功，请登录')
      }
    } catch (err: unknown) {
      const resp = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response
        : null
      const msg = resp?.data?.detail
      if (msg === '无效的认证凭据') {
        setError('用户名或密码错误')
      } else if (msg === 'Username already registered') {
        setError('用户名已存在')
      } else if (msg === 'Email already registered') {
        setError('邮箱已被注册')
      } else {
        setError(msg || '操作失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 shadow-lift mb-4">
            <TreePine className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">UGVIS</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">城市绿视率智能规划系统</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-card border border-surface-200/60 dark:border-surface-700/60 p-8">
          {reason === 'session_expired' && (
            <div className="mb-4 p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg text-sm text-warning-700 dark:text-warning-300">
              登录已过期，请重新登录
            </div>
          )}

          {/* Login / Register Tabs */}
          <div className="flex mb-6 border-b border-surface-200 dark:border-surface-700">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError('') }}
              className={`flex-1 pb-3 text-center text-sm font-medium border-b-2 transition-colors ${
                isLogin
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError('') }}
              className={`flex-1 pb-3 text-center text-sm font-medium border-b-2 transition-colors ${
                !isLogin
                  ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                  : 'border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="输入用户名"
                autoComplete="username"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="输入邮箱"
                  autoComplete="email"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="输入密码"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
            >
              {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-surface-200 dark:border-surface-700 text-center text-sm text-surface-500 dark:text-surface-400">
            {isLogin ? (
              <>
                还没有账号？{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError('') }}
                  className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setError('') }}
                  className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  登录
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-surface-400 dark:text-surface-500">
          <a href="/" className="hover:text-surface-600 dark:hover:text-surface-300 transition-colors">← 返回首页</a>
        </div>
      </div>
    </div>
  )
}
