// Planning page shared types and constants

export interface WeakArea {
  id: number
  point_id: number
  lat: number
  lng: number
  gvi_winter: number | null
  gvi_spring: number | null
  gvi_summer: number | null
  gvi_autumn: number | null
  road_type: string | null
  priority: string
  suggestion: string
}

export interface PlanningStats {
  high_priority: number
  medium_priority: number
  low_priority: number
  estimated_trees: number
  estimated_gvi_improvement: number
}

export const ROAD_TYPE_LABELS: Record<string, string> = {
  rc1: '快速路',
  rc2: '主干路',
  rc3: '次干路',
  rc4: '支路',
}

export const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-700', bg: 'bg-red-50' },
  medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  low: { label: '低', color: 'text-green-700', bg: 'bg-green-50' },
}

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_weak_areas: '查询薄弱区域',
  get_statistics: '获取统计数据',
  get_seasonal_gvi: '查询季节GVI',
  get_point_detail: '查看采样点详情',
  get_prompt_templates: '获取提示模板',
}

export const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi (Moonshot)' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'custom', label: '自定义' },
]

export const DEFAULT_MODELS: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o',
  kimi: 'moonshot-v1-128k',
  claude: 'claude-3-5-sonnet-20241022',
  custom: 'gpt-4o',
}
