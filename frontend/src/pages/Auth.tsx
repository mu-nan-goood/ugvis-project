import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">UGVIS</h1>
          <p className="text-gray-500 mt-2">城市绿视率分析系统</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          {reason === 'session_expired' && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              登录已过期，请重新登录
            </div>
          )}

          <div className="flex mb-6 border-b">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError('') }}
              className={`flex-1 pb-3 text-center font-medium border-b-2 transition-colors ${
                isLogin
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError('') }}
              className={`flex-1 pb-3 text-center font-medium border-b-2 transition-colors ${
                !isLogin
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder="输入用户名"
                autoComplete="username"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                  placeholder="输入邮箱"
                  autoComplete="email"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder="输入密码"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? '处理中...' : (isLogin ? '登录' : '注册')}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t text-center text-sm text-gray-500">
            {isLogin ? (
              <>
                还没有账号？{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError('') }}
                  className="text-primary-600 hover:underline"
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
                  className="text-primary-600 hover:underline"
                >
                  登录
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-400">
          <a href="/" className="hover:text-gray-600">← 返回首页</a>
        </div>
      </div>
    </div>
  )
}
