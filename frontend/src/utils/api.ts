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

export default api
