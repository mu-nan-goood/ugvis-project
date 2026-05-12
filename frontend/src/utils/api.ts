import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

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

export default api
