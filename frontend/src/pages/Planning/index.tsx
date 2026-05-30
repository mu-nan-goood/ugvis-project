import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchPlanningWeakAreas,
  streamAdvice,
  type ChatMessage,
  type LLMConfig,
} from '../../utils/api'
import type { WeakArea, PlanningStats } from './types'
import { ROAD_TYPE_LABELS } from './types'
import StatsCards from './StatsCards'
import LLMConfigPanel from './LLMConfigPanel'
import AdvicePanel from './AdvicePanel'
import WeakAreasTable from './WeakAreasTable'
import AIChatDrawer from './AIChatDrawer'

const PAGE_SIZE = 50

export default function Planning() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<PlanningStats | null>(null)
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterRoadType, setFilterRoadType] = useState<string>('all')

  // Pagination state
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // AI Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // LLM Config
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'deepseek',
    model: 'deepseek-chat',
  })
  const [showConfig, setShowConfig] = useState(false)

  // Advice generation
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceText, setAdviceText] = useState('')

  // Expert Panel state
  const [chatMode, setChatMode] = useState<'chat' | 'expert'>('chat')

  // Selected point for AI context
  const [selectedPoint, setSelectedPoint] = useState<WeakArea | null>(null)

  // Fetch paginated data from API
  const loadData = useCallback(async (page: number, priority: string, roadType: string) => {
    setLoading(true)
    try {
      const priorityParam = priority !== 'all' ? priority : undefined
      // F6 fix: road_type filter moved to server side
      const roadTypeParam = roadType !== 'all' ? roadType : undefined
      const data = await fetchPlanningWeakAreas({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        priority: priorityParam,
        road_type: roadTypeParam,
      })
      setStats(data.stats || null)
      setWeakAreas(data.weak_areas || [])
      setTotalCount(data.total || 0)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + reload when page/filters change
  useEffect(() => {
    loadData(currentPage, filterPriority, filterRoadType)
  }, [loadData, currentPage, filterPriority, filterRoadType])

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(1) }, [filterPriority, filterRoadType])

  // Listen for AI ask events from MapView
  // ── Navigation ─────────────────────────────────────
  function openInMap(area: WeakArea) {
    navigate(
      `/map?highlight=${area.point_id}&lat=${area.lat.toFixed(6)}&lng=${area.lng.toFixed(6)}`,
    )
  }

  function openRouteInMap(areaIds: number[]) {
    navigate(`/map?highlight=${areaIds.join(',')}&route=${areaIds.join(',')}`)
  }

  // ── Advice Generation ──────────────────────────────
  async function handleGenerateAdvice() {
    if (llmConfig.provider === 'custom' && !llmConfig.api_key) {
      setShowConfig(true)
      return
    }
    setAdviceLoading(true)
    setAdviceText('')
    try {
      for await (const event of streamAdvice({ llm_config: llmConfig })) {
        if (event.type === 'chunk') {
          setAdviceText((prev) => prev + event.content)
        } else if (event.type === 'error') {
          setAdviceText('错误: ' + event.content)
          break
        }
      }
    } catch (err: unknown) {
      setAdviceText('请求失败: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setAdviceLoading(false)
    }
  }

  // ── Ask AI about a specific weak area ───────────────
  function askAIAboutPoint(area: WeakArea) {
    setSelectedPoint(area)
    setChatOpen(true)
    const context = `请分析采样点 ${area.point_id}（坐标 ${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}），道路类型：${ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '未知'}，四季 GVI：冬${area.gvi_winter?.toFixed(1) ?? '-'}% 春${area.gvi_spring?.toFixed(1) ?? '-'}% 夏${area.gvi_summer?.toFixed(1) ?? '-'}% 秋${area.gvi_autumn?.toFixed(1) ?? '-'}%，改造建议：${area.suggestion}。给我具体的绿化改造建议。`
    // R12 fix: dispatch CustomEvent directly to AIChatDrawer
    window.dispatchEvent(new CustomEvent('ugvis-ask-ai', {
      detail: { context }
    }))
  }

  const topHighlightIds = weakAreas
    .filter((a) => a.priority === 'high')
    .slice(0, 10)
    .map((a) => a.point_id)

  const areaIds = weakAreas.slice(0, 20).map((a) => String(a.point_id)).join(',')

  // ── Loading / Error states ──────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton for header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>
        {/* Skeleton for stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-32 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        {/* Skeleton for table */}
        <div className="card animate-pulse">
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-600">加载失败: {error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">规划决策支持</h2>
        <div className="flex gap-2">
          {topHighlightIds.length > 1 && (
            <button
              onClick={() => openRouteInMap(topHighlightIds)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🗺️ 预览高优先级路线
            </button>
          )}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            ⚙️ LLM配置
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🤖 AI助手
          </button>
        </div>
      </div>

      {/* LLM Config Panel */}
      {showConfig && (
        <LLMConfigPanel config={llmConfig} onChange={setLlmConfig} />
      )}

      {/* AI Advice Panel */}
      <AdvicePanel
        adviceText={adviceText}
        adviceLoading={adviceLoading}
        areaIds={areaIds}
        onGenerate={handleGenerateAdvice}
      />

      {/* Stats Cards */}
      {stats && <StatsCards stats={stats} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="text-sm text-gray-500 mr-2">优先级:</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border rounded-lg px-3 py-1 text-sm"
          >
            <option value="all">全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-500 mr-2">道路类型:</label>
          <select
            value={filterRoadType}
            onChange={(e) => setFilterRoadType(e.target.value)}
            className="border rounded-lg px-3 py-1 text-sm"
          >
            <option value="all">全部</option>
            <option value="rc1">快速路</option>
            <option value="rc2">主干路</option>
            <option value="rc3">次干路</option>
            <option value="rc4">支路</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          共 {totalCount} 条，第 {currentPage}/{totalPages} 页
        </div>
      </div>

      {/* Weak Areas Table */}
      <WeakAreasTable
        areas={weakAreas}
        selectedPointId={selectedPoint?.point_id}
        onOpenInMap={openInMap}
        onAskAI={askAIAboutPoint}
      />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => { setCurrentPage(1); }}
            disabled={currentPage <= 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            首页
          </button>
          <button
            onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); }}
            disabled={currentPage <= 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页
          </button>
          <button
            onClick={() => { setCurrentPage(totalPages); }}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            末页
          </button>
        </div>
      )}

      {/* AI Chat Drawer */}
      <AIChatDrawer
        open={chatOpen}
        onClose={() => { setChatOpen(false); setSelectedPoint(null) }}
        messages={messages}
        onMessagesChange={setMessages}
        llmConfig={llmConfig}
        chatMode={chatMode}
        onChatModeChange={setChatMode}
        selectedPoint={selectedPoint}
      />
    </div>
  )
}
