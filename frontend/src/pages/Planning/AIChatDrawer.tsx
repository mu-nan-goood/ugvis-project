import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  streamChat,
  streamExpertPanel,
  type ChatMessage,
  type LLMConfig,
} from '../../utils/api'
import type { WeakArea } from './types'
import { ROAD_TYPE_LABELS, TOOL_DISPLAY_NAMES } from './types'

interface AIChatDrawerProps {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  onMessagesChange: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  llmConfig: LLMConfig
  chatMode: 'chat' | 'expert'
  onChatModeChange: (mode: 'chat' | 'expert') => void
  selectedPoint: WeakArea | null
}

export default function AIChatDrawer({
  open,
  onClose,
  messages,
  onMessagesChange,
  llmConfig,
  chatMode,
  onChatModeChange,
  selectedPoint,
}: AIChatDrawerProps) {
  const [inputMessage, setInputMessage] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [moderatorText, setModeratorText] = useState('')
  const [panelActive, setPanelActive] = useState(false)
  const [expandedExperts, setExpandedExperts] = useState<Record<string, boolean>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)

  // F5 fix: use ref to track active request ID, discard stale SSE updates
  const requestIdRef = useRef(0)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // R12 fix: listen for CustomEvent dispatched by GVIMap instead of MessageEvent.
  // GVIMap dispatches CustomEvents (ugvis-ask-ai), not window.postMessage.
  // Using the correct event type avoids unnecessary origin checks.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.context) {
        // Planning page sends full context string
        setInputMessage(detail.context)
      } else if (detail?.pointId != null) {
        // GVIMap sends pointId from popup click
        setInputMessage(`请分析采样点 ${detail.pointId} 的绿化情况`)
      }
    }
    window.addEventListener('ugvis-ask-ai', handler)
    return () => window.removeEventListener('ugvis-ask-ai', handler)
  }, [])

  async function handleSendMessage() {
    if (!inputMessage.trim() || chatLoading) return
    if (llmConfig.provider === 'custom' && !llmConfig.api_key) return

    const userMsg: ChatMessage = { role: 'user', content: inputMessage.trim() }
    onMessagesChange([...messages, userMsg])
    setInputMessage('')
    setChatLoading(true)
    setStreamingText('')
    setModeratorText('')
    setPanelActive(false)

    // F5 fix: increment request ID so stale SSE events are discarded
    const thisRequestId = ++requestIdRef.current

    if (chatMode === 'expert') {
      await handleExpertPanel(userMsg, thisRequestId)
    } else {
      await handleNormalChat(userMsg, thisRequestId)
    }
  }

  async function handleExpertPanel(userMsg: ChatMessage, requestId: number) {
    let modText = ''
    const currentMessages = [...messages, userMsg]
    // B20 fix: track streaming expert message indices for in-place updates
    const streamingExpertIdx: Record<string, number> = {}
    try {
      const history = currentMessages.filter((m) => m.role !== 'system')
      for await (const event of streamExpertPanel({
        message: userMsg.content,
        history,
        llm_config: llmConfig,
      })) {
        // F5 fix: discard events from stale requests
        if (requestIdRef.current !== requestId) return

        if (event.type === 'panel_start') {
          setPanelActive(true)
          onMessagesChange([...currentMessages, {
            role: 'system',
            content: `🎯 专家小组启动，参与专家：${event.experts?.map((e: { emoji: string; name: string }) => e.emoji + e.name).join('、') || ''}`
          }])
        } else if (event.type === 'expert_start') {
          // B20 fix: add a streaming placeholder for this expert
          onMessagesChange(prev => {
            const idx = prev.length
            streamingExpertIdx[event.expert_id] = idx
            return [...prev, {
              role: 'expert' as const,
              content: `${event.emoji || ''} **${event.expert_name}**\n`,
              expert_id: event.expert_id,
            }]
          })
        } else if (event.type === 'expert_chunk') {
          // B20 fix: update streaming expert message in-place
          const idx = streamingExpertIdx[event.expert_id]
          if (idx !== undefined) {
            onMessagesChange(prev => {
              const next = [...prev]
              if (next[idx] && next[idx].role === 'expert') {
                next[idx] = { ...next[idx], content: next[idx].content + event.content }
              }
              return next
            })
          }
        } else if (event.type === 'expert_done') {
          // B20 fix: replace streaming message with final complete version
          const idx = streamingExpertIdx[event.expert_id]
          if (idx !== undefined) {
            onMessagesChange(prev => {
              const next = [...prev]
              next[idx] = {
                role: 'expert' as const,
                content: `${event.emoji || ''} **${event.expert_name}**\n${event.opinion}`,
                expert_id: event.expert_id,
              }
              return next
            })
          } else {
            // Fallback: no streaming placeholder was created
            onMessagesChange(prev => [...prev, {
              role: 'expert' as const,
              content: `${event.emoji || ''} **${event.expert_name}**\n${event.opinion}`,
              expert_id: event.expert_id,
            }])
          }
        } else if (event.type === 'moderator_start') {
          onMessagesChange(prev => [...prev, {
            role: 'moderator_start',
            content: '📋 主持人整合专家意见中...',
          }])
        } else if (event.type === 'moderator_chunk') {
          modText += event.content
          setModeratorText(modText)
        } else if (event.type === 'moderator_done') {
          onMessagesChange(prev => [...prev, {
            role: 'assistant',
            content: '🎯 **主持人综合建议**\n\n' + (event.content || modText),
          }])
          setModeratorText('')
        } else if (event.type === 'panel_done') {
          onMessagesChange(prev => [...prev, {
            role: 'system',
            content: '✅ 专家小组讨论完成',
          }])
        } else if (event.type === 'error') {
          onMessagesChange(prev => [...prev, {
            role: 'assistant',
            content: '专家小组错误：' + event.content,
          }])
          break
        }
      }
    } catch (err: unknown) {
      // F5 fix: only show error if still the active request
      if (requestIdRef.current !== requestId) return
      const errMsg = err instanceof Error ? err.message : String(err)
      onMessagesChange(prev => [...prev, {
        role: 'assistant',
        content: '专家小组请求失败：' + errMsg,
      }])
    } finally {
      if (requestIdRef.current === requestId) {
        setChatLoading(false)
        setPanelActive(false)
      }
    }
  }

  async function handleNormalChat(userMsg: ChatMessage, requestId: number) {
    let fullText = ''
    const currentMessages = [...messages, userMsg]
    const toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result?: unknown }> = []
    try {
      const history = currentMessages.filter((m) => m.role !== 'system')
      for await (const event of streamChat({
        message: userMsg.content,
        history,
        llm_config: llmConfig,
      })) {
        // F5 fix: discard events from stale requests
        if (requestIdRef.current !== requestId) return

        if (event.type === 'chunk') {
          fullText += event.content
          setStreamingText(fullText)
        } else if (event.type === 'tool_call_start') {
          const toolName = TOOL_DISPLAY_NAMES[event.name] || event.name
          toolCalls.push({ name: event.name, arguments: event.arguments || {} })
          fullText += `\n> 🔧 调用工具: **${toolName}**...\n`
          setStreamingText(fullText)
        } else if (event.type === 'tool_result') {
          const toolName = TOOL_DISPLAY_NAMES[event.name] || event.name
          const lastCall = toolCalls[toolCalls.length - 1]
          if (lastCall) lastCall.result = event.data
          if (event.success) {
            fullText += `> ✅ ${toolName} 执行完成\n`
          } else {
            fullText += `> ❌ ${toolName} 执行失败: ${event.error || '未知错误'}\n`
          }
          setStreamingText(fullText)
        } else if (event.type === 'start') {
          // R4 fix: show start indicator so user knows the request is being processed
          setStreamingText('⏳ 正在思考...')
        } else if (event.type === 'error') {
          onMessagesChange(prev => [...prev, { role: 'assistant', content: '错误: ' + event.content }])
          setStreamingText('')
          break
        }
      }
      if (requestIdRef.current !== requestId) return
      if (fullText) {
        onMessagesChange(prev => [...prev, { role: 'assistant', content: fullText }])
      } else {
        onMessagesChange(prev => [...prev, { role: 'assistant', content: '（无响应）' }])
      }
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) return
      const errMsg = err instanceof Error ? err.message : String(err)
      onMessagesChange(prev => [...prev, { role: 'assistant', content: '请求失败: ' + errMsg }])
    } finally {
      if (requestIdRef.current === requestId) {
        setStreamingText('')
        setChatLoading(false)
      }
    }
  }

  if (!open) return null

  const quickPrompts = chatMode === 'expert'
    ? [
        { text: '冬季绿化建议', prompt: '请从四个角度分析冬季绿化薄弱区域的改造方案' },
        { text: '主干路绿化评估', prompt: '分析主干路(rc2)的绿化现状并给出改进方案' },
        { text: '预算优化', prompt: '在有限预算下，如何优先安排绿化改造？' },
      ]
    : [
        { text: '薄弱区域分析', prompt: '请分析当前绿化薄弱区域的分布特征' },
        { text: '植物选择建议', prompt: '针对GVI低于5%的区域，推荐适合的绿化植物' },
        { text: '季节差异', prompt: '四季GVI差异最大的区域在哪里？如何改善？' },
      ]

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl z-50 flex flex-col">
      {/* Header */}
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
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => onChatModeChange('chat')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                chatMode === 'chat'
                  ? 'bg-white shadow text-primary-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              💬 对话
            </button>
            <button
              onClick={() => onChatModeChange('expert')}
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
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-xl"
        >
          ×
        </button>
      </div>

      {/* Messages */}
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
                <p>坐标：{selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}</p>
                <p>类型：{ROAD_TYPE_LABELS[selectedPoint.road_type || '']}</p>
                <p>建议：{selectedPoint.suggestion}</p>
              </div>
            )}
          </div>
        )}
        {messages.map((msg, idx) => {
          if (msg.role === 'system') {
            return (
              <div key={idx} className="text-center text-xs text-gray-400 py-1">
                {msg.content}
              </div>
            )
          }
          if (msg.role === 'expert') {
            const expertId = msg.expert_id || idx
            const isExpanded = expandedExperts[expertId] !== false
            return (
              <div key={idx} className={`bg-amber-50 border border-amber-200 rounded-lg text-sm transition-all ${isExpanded ? 'px-4 py-3' : 'px-4 py-2'}`}>
                <div
                  className='flex items-center justify-between cursor-pointer select-none'
                  onClick={() => setExpandedExperts(prev => ({ ...prev, [expertId]: !isExpanded }))}
                >
                  <span className='font-medium text-amber-800 text-xs'>
                    {msg.content.split('\n')[0].substring(0, 60)}
                    {!isExpanded && msg.content.length > 60 ? '...' : ''}
                  </span>
                  <span className='text-amber-500 text-xs ml-2'>
                    {isExpanded ? '🔼 收起' : '🔽 展开'}
                  </span>
                </div>
                {isExpanded && (
                  <div className='prose prose-sm max-w-none mt-2'>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            )
          }
          if (msg.role === 'moderator_start') {
            return (
              <div key={idx} className="text-center py-1">
                <span className="text-xs text-primary-600 font-medium animate-pulse">{msg.content}</span>
              </div>
            )
          }
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

      {/* Input */}
      <div className="p-4 border-t">
        {messages.length === 0 && !chatLoading && (
          <div className='flex flex-wrap gap-1.5 mb-3'>
            {quickPrompts.map((q, i) => (
              <button
                key={i}
                onClick={() => setInputMessage(q.prompt)}
                className='px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs transition-colors'
              >
                {q.text}
              </button>
            ))}
          </div>
        )}
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
  )
}
