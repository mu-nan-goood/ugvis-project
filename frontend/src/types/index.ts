// UGVIS 共享类型定义

// ── 用户认证 ────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'user'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

export interface TokenPayload {
  sub: string
  user_id: number
  role: UserRole
  exp: number
  type: 'access' | 'refresh'
}

export interface SeasonalGVI {
  gvi_spring: number | null
  gvi_summer: number | null
  gvi_autumn: number | null
  gvi_winter: number | null
}

export interface SeasonalNDVI {
  ndvi_spring: number | null
  ndvi_summer: number | null
  ndvi_autumn: number | null
  ndvi_winter: number | null
}

export interface SamplingPoint extends SeasonalGVI, SeasonalNDVI {
  id: number
  point_id: number
  lat: number
  lng: number
  road_type: string | null
  created_at: string | null
}

export interface SamplingPointList {
  items: SamplingPoint[]
  total: number
  skip: number
  limit: number
}

export interface MapPoint {
  id: number
  lat: number
  lng: number
  gvi: number | null
  ndvi: number | null
  road_type: string | null
}

export interface MapPointResponse {
  points: MapPoint[]
}

export interface SeasonalStat {
  season: string
  avg_gvi: number
  avg_ndvi: number
  sample_count: number
}

export interface StatsResponse {
  total_points: number
  total_roads: number
  road_types: Record<string, number>
  seasonal: SeasonalStat[]
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export const SEASON_LABELS: Record<Season, string> = {
  spring: '春季',
  summer: '夏季',
  autumn: '秋季',
  winter: '冬季',
}

export const ROAD_TYPE_LABELS: Record<string, string> = {
  rc1: '快速路',
  rc2: '主干道',
  rc3: '次干道',
  rc4: '支路',
}

export const SEASON_GVI_FIELD: Record<Season, keyof SeasonalGVI> = {
  spring: 'gvi_spring',
  summer: 'gvi_summer',
  autumn: 'gvi_autumn',
  winter: 'gvi_winter',
}

// ── Map highlight / route ──────────────────────────────

export interface HighlightPoint {
  id: number          // map point id
  lat: number
  lng: number
  label?: string      // optional label shown on map
}

export interface RouteSegment {
  from: HighlightPoint
  to: HighlightPoint
}

// ── 绿波路线规划 ────────────────────────────────────────

export interface RouteCoord {
  lat: number
  lng: number
}

export interface SegmentGVI {
  from_idx: number
  to_idx: number
  length_m: number
  sample_count: number
  avg_gvi: {
    spring: number | null
    summer: number | null
    autumn: number | null
    winter: number | null
  }
}

export interface RouteAnalysis {
  total_length_m: number
  total_samples: number
  overall_gvi: {
    spring: number | null
    summer: number | null
    autumn: number | null
    winter: number | null
  }
  gvi_range: {
    spring_min: number | null
    spring_max: number | null
    winter_min: number | null
    winter_max: number | null
  }
  segments: SegmentGVI[]
  best_segment: SegmentGVI | null
  worst_segment: SegmentGVI | null
  season_verdict: {
    best_season: string | null
    worst_season: string | null
    gap: number | null
  }
}

export interface RouteComparison {
  user_route: RouteAnalysis & { coords: RouteCoord[] }
  green_route: RouteAnalysis & { coords: RouteCoord[] }
  comparison: {
    length_diff_m: number
    gvi_improvement_pct: number
    verdict: string
  }
}
