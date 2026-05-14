import axios from 'axios'
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  withCredentials: true, // 允许携带 cookie
})

// ── Token 管理 ─────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'ugvis_access_token'

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
}

// ── 请求拦截器：自动注入 Bearer Token ───────────────────

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function processRefreshQueue(token: string) {
  refreshQueue.forEach((cb) => cb(token))
  refreshQueue = []
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── 响应拦截器：401 时自动刷新 Token ─────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // 如果是 401 且未尝试过刷新，则尝试刷新
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // 已经在刷新中，将请求加入队列
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(api(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post<AuthResponse>(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        setAccessToken(data.access_token)
        processRefreshQueue(data.access_token)
        isRefreshing = false

        // 重试原请求
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        isRefreshing = false
        clearAccessToken()
        // 刷新失败，重定向到登录页
        window.location.href = '/auth?reason=session_expired'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// ── 认证 API ───────────────────────────────────────────

/** 登录 */
export async function login(req: LoginRequest): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', req)
  setAccessToken(data.access_token)
  return data
}

/** 注册 */
export async function register(req: RegisterRequest): Promise<User> {
  const { data } = await api.post<User>('/auth/register', req)
  return data
}

/** 获取当前用户信息 */
export async function getMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me')
  return data
}

/** 登出 */
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch {
    // 忽略错误
  } finally {
    clearAccessToken()
  }
}

/** 检查是否已登录（同步）*/
export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

// 统计数据
export async function fetchStats() {
  const { data } = await api.get('/stats')
  return data
}

// 采样点列表（分页+筛选）
export async function fetchPoints(params?: {
  skip?: number
  limit?: number
  season?: string
  road_type?: string
}) {
  const { data } = await api.get('/points', { params })
  return data
}

// 地图点位数据
export async function fetchMapPoints(params?: {
  season?: string
  limit?: number
}) {
  const { data } = await api.get('/map/points', { params })
  return data
}

// 道路段列表
export async function fetchRoads(params?: {
  skip?: number
  limit?: number
  road_type?: string
}) {
  const { data } = await api.get('/roads', { params })
  return data
}

// 季节分析
export async function fetchSeasonalAnalysis() {
  const { data } = await api.get('/seasonal/analysis')
  return data
}

// 空间分析（模型对比）
export async function fetchAnalysisModels() {
  const { data } = await api.get('/analysis/models')
  return data
}

// 规划决策（薄弱区）
export async function fetchPlanningWeakAreas() {
  const { data } = await api.get('/planning/weak-areas')
  return data
}

// ── AI / LLM 相关 ──────────────────────────────────────

export interface LLMConfig {
  provider: string
  model?: string
  api_key?: string   // 仅 custom provider 需要
  api_base?: string  // 仅 custom provider 需要
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequest {
  message: string
  history: ChatMessage[]
  llm_config?: LLMConfig
  preferences?: Record<string, any>
}

export interface RenovationAdviceRequest {
  areas?: any[]
  preferences?: Record<string, any>
  llm_config?: LLMConfig
  system_prompt?: string
}

/**
 * 生成 AI 改造建议（非流式）
 */
export async function generateAdvice(request: RenovationAdviceRequest) {
  const { data } = await api.post('/planning/advice', request)
  return data
}

/**
 * 流式生成 AI 改造建议（SSE）
 */
export async function* streamAdvice(request: RenovationAdviceRequest): AsyncGenerator<any, void, unknown> {
  const response = await fetch('/api/planning/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const match = line.match(/^data: (.+)$/m)
      if (match) {
        try {
          yield JSON.parse(match[1])
        } catch {
          // ignore parse error
        }
      }
    }
  }
}

/**
 * 多轮对话（非流式）
 */
export async function chat(request: ChatRequest) {
  const { data } = await api.post('/planning/chat', request)
  return data
}

/**
 * 流式多轮对话（SSE）
 */
export async function* streamChat(request: ChatRequest): AsyncGenerator<any, void, unknown> {
  const response = await fetch('/api/planning/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const match = line.match(/^data: (.+)$/m)
      if (match) {
        try {
          yield JSON.parse(match[1])
        } catch {
          // ignore parse error
        }
      }
    }
  }
}

// ── 数据导入 ───────────────────────────────────────────

export interface ImportError {
  row: number
  point_id?: number
  message: string
}

export interface ImportResult {
  success_count: number
  error_count: number
  total_rows: number
  errors: ImportError[]
}

/**
 * 上传 CSV 文件导入采样点数据
 * @param file CSV 文件
 * @param onProgress 上传进度回调（0-100）
 */
export async function importPoints(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post<ImportResult>('/points/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (ev) => {
      if (onProgress && ev.total) {
        onProgress(Math.round((ev.loaded * 100) / ev.total))
      }
    },
  })
  return data
}

// ── 建议质量反馈 ─────────────────────────────────────

export interface FeedbackItem {
  id: number
  vote: string
  comment?: string
  advice_context?: string
  area_ids?: string
  season?: string
  created_at: string
}

export interface FeedbackStats {
  total: number
  up_count: number
  down_count: number
  up_rate: number
}

export interface FeedbackSubmitData {
  vote: 'up' | 'down'
  comment?: string
  advice_context?: string
  area_ids?: string
  season?: string
}

/** 提交反馈 */
export async function submitFeedback(data: FeedbackSubmitData): Promise<FeedbackItem> {
  const { data: result } = await api.post<FeedbackItem>('/feedback', data)
  return result
}

/** 查询反馈列表 */
export async function fetchFeedbackList(params?: {
  skip?: number
  limit?: number
  vote?: string
}): Promise<FeedbackItem[]> {
  const { data } = await api.get<FeedbackItem[]>('/feedback', { params })
  return data
}

/** 查询反馈统计 */
export async function fetchFeedbackStats(): Promise<FeedbackStats> {
  const { data } = await api.get<FeedbackStats>('/feedback/stats')
  return data
}

/** 删除反馈 */
export async function deleteFeedback(id: number): Promise<void> {
  await api.delete(`/feedback/${id}`)
}

// ── 绿波路线规划 ─────────────────────────────────────

import type { RouteCoord, RouteAnalysis, RouteComparison } from '../types'

/** 分析路线 GVI */
export async function analyzeRoute(coords: RouteCoord[]): Promise<RouteAnalysis> {
  const { data } = await api.post<RouteAnalysis>('/routing/analyze', { coords })
  return data
}

/** 路线对比（用户路线 vs 更绿路线） */
export async function compareRoutes(coords: RouteCoord[]): Promise<RouteComparison> {
  const { data } = await api.post<RouteComparison>('/routing/compare', { coords })
  return data
}

export default api
