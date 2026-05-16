import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  fetchPlanningWeakAreas,
  streamAdvice,
  streamChat,
  submitFeedback,
  fetchFeedbackStats,
  streamExpertPanel,
  type ChatMessage,
  type LLMConfig,
  type FeedbackStats,
} from '../utils/api'

interface WeakArea {
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

interface PlanningStats {
  high_priority: number
  medium_priority: number
  low_priority: number
  estimated_trees: number
  estimated_gvi_improvement: number
}

const ROAD_TYPE_LABELS: Record<string, string> = {
  rc1: '快速路',
  rc2: '主干路',
  rc3: '次干路',
  rc4: '支路',
}

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-700', bg: 'bg-red-50' },
  medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  low: { label: '低', color: 'text-green-700', bg: 'bg-green-50' },
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_weak_areas: '查询薄弱区域',
  get_statistics: '获取统计数据',
  get_seasonal_gvi: '查询季节GVI',
  get_point_detail: '查看采样点详情',
  get_prompt_templates: '获取提示模板',
}

const PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi (Moonshot)' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'custom', label: '自定义' },
]

const DEFAULT_MODELS: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o',
  kimi: 'moonshot-v1-128k',
  claude: 'claude-3-5-sonnet-20241022',
  custom: 'gpt-4o',
}

export default function Planning() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<PlanningStats | null>(null)
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterRoadType, setFilterRoadType] = useState<string>('all')

  // AI Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // LLM Config
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'deepseek',
    model: 'deepseek-chat',
  })
  const [showConfig, setShowConfig] = useState(false)

  // Advice generation
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [adviceText, setAdviceText] = useState('')

  // Feedback state
  const [feedbackVote, setFeedbackVote] = useState<'up' | 'down' | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)

  // Expert Panel state
  const [chatMode, setChatMode] = useState<'chat' | 'expert'>('chat')
  // @ts-ignore - used for future expert opinion display
  const [expertOpinions, setExpertOpinions] = useState<Record<string, { name: string; emoji: string; opinion: string }>>({})
  const [moderatorText, setModeratorText] = useState('')
  const [panelActive, setPanelActive] = useState(false)

  // Selected point for AI context
  const [selectedPoint, setSelectedPoint] = useState<WeakArea | null>(null)

  useEffect(() => {
    fetchPlanningWeakAreas()
      .then((data) => {
        setStats(data.stats || null)
        setWeakAreas(data.weak_areas || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Listen for AI ask events from MapView
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ask-ai') {
        const pointId = e.data.pointId
        const area = weakAreas.find((a) => a.point_id === pointId)
        if (area) {
          setSelectedPoint(area)
          setChatOpen(true)
          // Auto-generate context
          const context = `请分析采样点 ${area.point_id}（坐标 ${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}），道路类型：${ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '未知'}，四季 GVI：冬${area.gvi_winter?.toFixed(1) ?? '-'}% 春${area.gvi_spring?.toFixed(1) ?? '-'}% 夏${area.gvi_summer?.toFixed(1) ?? '-'}% 秋${area.gvi_autumn?.toFixed(1) ?? '-'}%，当前改造建议：${area.suggestion}。`
          setInputMessage(context)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [weakAreas])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // ── Feedback Functions ────────────────────────────────

  // 获取反馈统计
  useEffect(() => {
    fetchFeedbackStats()
      .then(setFeedbackStats)
      .catch(() => {})
  }, [])

  // 当建议内容变化时，重置反馈状态
  useEffect(() => {
    setFeedbackVote(null)
    setFeedbackComment('')
  }, [adviceText])

  async function handleFeedbackVote(vote: 'up' | 'down') {
    if (feedbackSubmitting) return
    setFeedbackSubmitting(true)
    try {
      await submitFeedback({
        vote,
        advice_context: adviceText.substring(0, 500),
        area_ids: weakAreas.slice(0, 20).map((a) => String(a.point_id)).join(','),
      })
      setFeedbackVote(vote)
      // 刷新统计
      fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
    } catch (err) {
      console.error('Feedback submit failed:', err)
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  async function handleFeedbackCommentSubmit() {
    if (!feedbackComment.trim() || feedbackSubmitting) return
    if (!feedbackVote) {
      // 先投up票
      setFeedbackVote('up')
      try {
        await submitFeedback({
          vote: 'up',
          comment: feedbackComment.trim(),
          advice_context: adviceText.substring(0, 500),
          area_ids: weakAreas.slice(0, 20).map((a) => String(a.point_id)).join(','),
        })
        fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
      } catch (err) {
        console.error('Feedback submit failed:', err)
      }
      setFeedbackComment('')
      return
    }
    setFeedbackSubmitting(true)
    try {
      await submitFeedback({
        vote: feedbackVote,
        comment: feedbackComment.trim(),
        advice_context: adviceText.substring(0, 500),
        area_ids: weakAreas.slice(0, 20).map((a) => String(a.point_id)).join(','),
      })
      setFeedbackComment('')
      fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
    } catch (err) {
      console.error('Feedback submit failed:', err)
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  // ── Navigation to map ────────────────────────────────
  function openInMap(area: WeakArea) {
    navigate(
      `/map?highlight=${area.point_id}&lat=${area.lat.toFixed(6)}&lng=${area.lng.toFixed(6)}`,
    )
  }

  function openRouteInMap(areaIds: number[]) {
    navigate(`/map?highlight=${areaIds.join(',')}&route=${areaIds.join(',')}`)
  }

  // ── AI Functions ─────────────────────────────────────

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
    } catch (err: any) {
      setAdviceText('请求失败: ' + err.message)
    } finally {
      setAdviceLoading(false)
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim() || chatLoading) return
    if (llmConfig.provider === 'custom' && !llmConfig.api_key) {
      setShowConfig(true)
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: inputMessage.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInputMessage('')
    setChatLoading(true)
    setStreamingText('')
    setExpertOpinions({})
    setModeratorText('')
    setPanelActive(true)

    // ── Expert Panel Mode ──────────────────────────────
    if (chatMode === 'expert') {
      let modText = ''
      try {
        const history = messages.filter((m) => m.role !== 'system')
        for await (const event of streamExpertPanel({
          message: userMsg.content,
          history,
          llm_config: llmConfig,
        })) {
          if (event.type === 'panel_start') {
            setMessages((prev) => [...prev, {
              role: 'system',
              content: `🎯 专家小组启动，参与专家：${event.experts?.map((e: any) => e.emoji + e.name).join('、') || ''}`
            }])
          } else if (event.type === 'expert_done') {
            const expertId = event.expert_id
            const expertName = event.expert_name
            const emoji = event.emoji || ''
            setExpertOpinions((prev) => ({
              ...prev,
              [expertId]: { name: expertName, emoji, opinion: event.opinion },
            }))
            setMessages((prev) => [...prev, {
              role: 'expert',
              content: `${emoji} **${expertName}**
${event.opinion}`,
              expert_id: expertId,
            }])
          } else if (event.type === 'moderator_start') {
            setMessages((prev) => [...prev, {
              role: 'moderator_start',
              content: '📋 主持人整合专家意见中...',
            }])
          } else if (event.type === 'moderator_chunk') {
            modText += event.content
            setModeratorText(modText)
          } else if (event.type === 'moderator_done') {
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: '🎯 **主持人综合建议**\n\n' + (event.content || modText),
            }])
            setModeratorText('')
          } else if (event.type === 'panel_done') {
            setMessages((prev) => [...prev, {
              role: 'system',
              content: '✅ 专家小组讨论完成',
            }])
          } else if (event.type === 'error') {
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: '专家小组错误：' + event.content,
            }])
            break
          }
        }
      } catch (err: any) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '专家小组请求失败：' + err.message,
        }])
      } finally {
        setChatLoading(false)
        setPanelActive(false)
      }
      return
    }

    // ── Normal Chat Mode (existing logic) ─────────────
    let fullText = ''
    let toolCalls: Array<{ name: string; arguments: Record<string, any>; result?: any }> = []
    try {
      const history = messages.filter((m) => m.role !== 'system')
      for await (const event of streamChat({
        message: userMsg.content,
        history,
        llm_config: llmConfig,
      })) {
        if (event.type === 'chunk') {
          fullText += event.content
          setStreamingText(fullText)
        } else if (event.type === 'tool_call_start') {
          const toolName = TOOL_DISPLAY_NAMES[event.name] || event.name
          toolCalls.push({ name: event.name, arguments: event.arguments || {} })
          setStreamingText((prev) => prev + `\n> 🔧 调用工具: **${toolName}**...\n`)
        } else if (event.type === 'tool_result') {
          const toolName = TOOL_DISPLAY_NAMES[event.name] || event.name
          const lastCall = toolCalls[toolCalls.length - 1]
          if (lastCall) lastCall.result = event.data
          if (event.success) {
            setStreamingText((prev) => prev + `> ✅ ${toolName} 执行完成\n`)
          } else {
            setStreamingText((prev) => prev + `> ❌ ${toolName} 执行失败: ${event.error || '未知错误'}\n`)
          }
        } else if (event.type === 'error') {
          setMessages((prev) => [...prev, { role: 'assistant', content: '错误: ' + event.content }])
          setStreamingText('')
          break
        }
      }
      if (fullText) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: '（无响应）' }])
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '请求失败: ' + err.message }])
    } finally {
      setStreamingText('')
      setChatLoading(false)
    }
  }

  // ── Ask AI about a specific weak area ───────────────
  function askAIAboutPoint(area: WeakArea) {
    setSelectedPoint(area)
    setChatOpen(true)
    const context = `请分析采样点 ${area.point_id}（坐标 ${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}），道路类型：${ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '未知'}，四季 GVI：冬${area.gvi_winter?.toFixed(1) ?? '-'}% 春${area.gvi_spring?.toFixed(1) ?? '-'}% 夏${area.gvi_summer?.toFixed(1) ?? '-'}% 秋${area.gvi_autumn?.toFixed(1) ?? '-'}%，改造建议：${area.suggestion}。给我具体的绿化改造建议。`
    setInputMessage(context)
  }

  // ── Filter weak areas ────────────────────────────────
  const filteredAreas = weakAreas.filter((area) => {
    const matchPriority = filterPriority === 'all' || area.priority === filterPriority
    const matchRoad = filterRoadType === 'all' || area.road_type === filterRoadType
    return matchPriority && matchRoad
  })

  // Default route: top 10 high priority areas for quick demo
  const topHighlightIds = filteredAreas
    .filter((a) => a.priority === 'high')
    .slice(0, 10)
    .map((a) => a.point_id)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
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
        <div className="card bg-blue-50 border-blue-200">
          <h3 className="font-semibold mb-3">LLM 配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">提供商</label>
              <select
                value={llmConfig.provider}
                onChange={(e) =>
                  setLlmConfig({
                    ...llmConfig,
                    provider: e.target.value,
                    model: DEFAULT_MODELS[e.target.value],
                  })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                API Key{llmConfig.provider !== 'custom' ? ' (可选，后端已配置)' : ' (必填)'}
              </label>
              <input
                type="password"
                value={llmConfig.api_key || ''}
                onChange={(e) => setLlmConfig({ ...llmConfig, api_key: e.target.value || undefined })}
                placeholder={llmConfig.provider === 'custom' ? 'sk-...' : '留空使用服务端配置'}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">模型</label>
              <input
                type="text"
                value={llmConfig.model || ''}
                onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                placeholder={DEFAULT_MODELS[llmConfig.provider]}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {llmConfig.provider === 'custom'
              ? 'Custom provider 需要提供 API Key 和 Base URL。'
              : '内置提供商的 API Key 由后端 .env 管理，无需前端传入。Custom provider 需手动填写。'}
          </p>
        </div>
      )}

      {/* AI Advice Panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">🌱 AI 绿化改造建议</h3>
          <button
            onClick={handleGenerateAdvice}
            disabled={adviceLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {adviceLoading ? '生成中...' : '生成建议'}
          </button>
        </div>
        {adviceText ? (
          <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{adviceText}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            点击&quot;生成建议&quot;获取 AI 分析的绿化改造方案。
          </p>
        )}

        {/* Feedback UI - 建议质量反馈 */}
        {adviceText && !adviceLoading && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            {/* 反馈统计 */}
            {feedbackStats && feedbackStats.total > 0 && (
              <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
                <span>已收集 {feedbackStats.total} 条反馈</span>
                <span className="text-green-600 font-medium">
                  好评率 {Math.round(feedbackStats.up_rate * 100)}%
                </span>
                <span>（👍 {feedbackStats.up_count} / 👎 {feedbackStats.down_count}）</span>
              </div>
            )}

            {/* 反馈按钮 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 mr-1">该建议：</span>
              <button
                onClick={() => handleFeedbackVote('up')}
                disabled={feedbackSubmitting || !!feedbackVote}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  feedbackVote === 'up'
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-gray-50 hover:bg-green-50 text-gray-600 border border-gray-200'
                } disabled:opacity-60`}
              >
                👍 有用
              </button>
              <button
                onClick={() => handleFeedbackVote('down')}
                disabled={feedbackSubmitting || !!feedbackVote}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  feedbackVote === 'down'
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-gray-50 hover:bg-red-50 text-gray-600 border border-gray-200'
                } disabled:opacity-60`}
              >
                👎 不满意
              </button>
              {feedbackVote && (
                <span className="text-xs text-green-600 ml-1">✓ 已反馈，感谢！</span>
              )}

              {/* 追加文字反馈 */}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleFeedbackCommentSubmit()
                    }
                  }}
                  placeholder="可选：补充意见"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <button
                  onClick={handleFeedbackCommentSubmit}
                  disabled={!feedbackComment.trim() || feedbackSubmitting}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg text-sm transition-colors"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}</div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-l-4 border-red-500">
            <h3 className="text-sm text-gray-500">高优先级区域</h3>
            <p className="text-2xl font-bold text-red-600">
              {stats.high_priority.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">冬季GVI &lt; 5%</p>
          </div>
          <div className="card border-l-4 border-yellow-500">
            <h3 className="text-sm text-gray-500">中优先级区域</h3>
            <p className="text-2xl font-bold text-yellow-600">
              {stats.medium_priority.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">冬季GVI 5-8%</p>
          </div>
          <div className="card border-l-4 border-green-500">
            <h3 className="text-sm text-gray-500">低优先级区域</h3>
            <p className="text-2xl font-bold text-green-600">
              {stats.low_priority.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">冬季GVI 8-10%</p>
          </div>
          <div className="card border-l-4 border-blue-500">
            <h3 className="text-sm text-gray-500">预估需补植树苗</h3>
            <p className="text-2xl font-bold text-blue-600">
              {stats.estimated_trees.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">按高3棵/中2棵估算</p>
          </div>
        </div>
      )}

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
          显示 {filteredAreas.length} / {weakAreas.length} 条
        </div>
      </div>

      {/* Weak Areas Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr className="border-b">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">坐标</th>
                <th className="text-right py-3 px-4">冬GVI</th>
                <th className="text-right py-3 px-4">春GVI</th>
                <th className="text-right py-3 px-4">夏GVI</th>
                <th className="text-right py-3 px-4">秋GVI</th>
                <th className="text-left py-3 px-4">道路类型</th>
                <th className="text-center py-3 px-4">优先级</th>
                <th className="text-left py-3 px-4">改造建议</th>
                <th className="text-center py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAreas.map((area) => {
                const p = PRIORITY_LABELS[area.priority] || PRIORITY_LABELS.low
                const isSelected = selectedPoint?.point_id === area.point_id
                return (
                  <tr
                    key={area.id}
                    className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <td className="py-2 px-4">{area.point_id}</td>
                    <td className="py-2 px-4 text-xs text-gray-500">
                      {area.lat.toFixed(4)},{area.lng.toFixed(4)}
                    </td>
                    <td className="text-right py-2 px-4">{area.gvi_winter?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_spring?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_summer?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_autumn?.toFixed(1) ?? '-'}</td>
                    <td className="py-2 px-4">
                      {ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '-'}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.bg} ${p.color}`}
                      >
                        {p.label}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs max-w-xs truncate" title={area.suggestion}>
                      {area.suggestion}
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => openInMap(area)}
                          title="在地图上查看"
                          className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                        >
                          📍查看
                        </button>
                        <button
                          onClick={() => askAIAboutPoint(area)}
                          title="询问AI"
                          className="px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-600 rounded transition-colors"
                        >
                          🤖询问
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold">
                🤖 AI 规划助手
                {selectedPoint && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    （分析点 {selectedPoint.point_id}）
                  </span>
                )}
              </h3>
              {/* Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setChatMode('chat')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    chatMode === 'chat'
                      ? 'bg-white shadow text-primary-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  💬 对话
                </button>
                <button
                  onClick={() => setChatMode('expert')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    chatMode === 'expert'
                      ? 'bg-white shadow text-primary-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🎯 专家小组
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setChatOpen(false)
                setSelectedPoint(null)
              }}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <p className="text-lg mb-2">👋 你好！</p>
                {chatMode === 'expert' ? (
                  <>
                    <p className="text-sm">🎯 专家小组模式</p>
                    <p className="text-sm mt-1">4位专家将并行分析你的问题：</p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>🏙️ 城市规划师 — 空间与布局视角</li>
                      <li>🌿 生态学家 — 生物与可持续视角</li>
                      <li>📊 数据分析师 — 量化与实证视角</li>
                      <li>💰 经济评估师 — 成本与收益视角</li>
                    </ul>
                    <p className="text-xs mt-2 text-gray-400">最后由主持人综合出最终方案</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">我是你的城市绿化规划 AI 助手。</p>
                    <p className="text-sm mt-1">可以问我关于：</p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>• 薄弱区域分析</li>
                      <li>• 绿化改造建议</li>
                      <li>• 植物选择推荐</li>
                      <li>• 预算估算</li>
                    </ul>
                  </>
                )}
                {selectedPoint && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-left text-xs">
                    <p className="font-semibold text-blue-700">已选薄弱点 {selectedPoint.point_id}</p>
                    <p>
                      坐标：{selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}
                    </p>
                    <p>类型：{ROAD_TYPE_LABELS[selectedPoint.road_type || '']}</p>
                    <p>建议：{selectedPoint.suggestion}</p>
                  </div>
                )}
              </div>
            )}
            {messages.map((msg, idx) => {
              // System messages (expert panel status)
              if (msg.role === 'system') {
                return (
                  <div key={idx} className="text-center text-xs text-gray-400 py-1">
                    {msg.content}
                  </div>
                )
              }
              // Expert opinion
              if (msg.role === 'expert') {
                return (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                )
              }
              // Moderator start indicator
              if (msg.role === 'moderator_start') {
                return (
                  <div key={idx} className="text-center py-1">
                    <span className="text-xs text-primary-600 font-medium animate-pulse">{msg.content}</span>
                  </div>
                )
              }
              // User / Assistant messages
              return (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )
            })}
            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-4 py-2 text-sm bg-gray-100 text-gray-800">
                  <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
            </div>
                  <span className="inline-block w-2 h-4 bg-primary-600 animate-pulse ml-1" />
                </div>
              </div>
            )}
            {/* Moderator streaming text during expert panel */}
            {moderatorText && panelActive && (
              <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 text-sm">
                <div className="text-xs font-semibold text-primary-700 mb-1">🎯 主持人整合中</div>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{moderatorText}</ReactMarkdown>
                </div>
                <span className="inline-block w-2 h-4 bg-primary-600 animate-pulse" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder={
                  chatMode === 'expert'
                    ? '输入问题，4位专家将并行分析...'
                    : selectedPoint
                      ? 'AI 已加载选中点上下文，直接发送即可...'
                      : '输入消息，或先选择薄弱点询问...'
                }
                disabled={chatLoading}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={chatLoading || !inputMessage.trim()}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
