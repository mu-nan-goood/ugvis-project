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
