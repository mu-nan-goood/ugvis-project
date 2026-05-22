import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { submitFeedback, fetchFeedbackStats, type FeedbackStats } from '../../utils/api'

interface AdvicePanelProps {
  adviceText: string
  adviceLoading: boolean
  areaIds: string
  onGenerate: () => void
}

export default function AdvicePanel({ adviceText, adviceLoading, areaIds, onGenerate }: AdvicePanelProps) {
  const [feedbackVote, setFeedbackVote] = useState<'up' | 'down' | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)

  // Load feedback stats on mount
  useEffect(() => {
    fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
  }, [])

  // Reset feedback when advice changes
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
        area_ids: areaIds,
      })
      setFeedbackVote(vote)
      fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
    } catch {
      // Feedback submission failed — show retry hint
      setFeedbackVote(null)
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  async function handleFeedbackCommentSubmit() {
    if (!feedbackComment.trim() || feedbackSubmitting) return
    if (!feedbackVote) {
      setFeedbackVote('up')
      try {
        await submitFeedback({
          vote: 'up',
          comment: feedbackComment.trim(),
          advice_context: adviceText.substring(0, 500),
          area_ids: areaIds,
        })
        fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
      } catch {
        // Submission failed — user can retry
        setFeedbackVote(null)
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
        area_ids: areaIds,
      })
      setFeedbackComment('')
      fetchFeedbackStats().then(setFeedbackStats).catch(() => {})
    } catch {
      // Submission failed — user can retry
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">🌱 AI 绿化改造建议</h3>
        <button
          onClick={onGenerate}
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

      {/* Feedback UI */}
      {adviceText && !adviceLoading && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          {feedbackStats && feedbackStats.total > 0 && (
            <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
              <span>已收集 {feedbackStats.total} 条反馈</span>
              <span className="text-green-600 font-medium">
                好评率 {Math.round(feedbackStats.up_rate * 100)}%
              </span>
              <span>（👍 {feedbackStats.up_count} / 👎 {feedbackStats.down_count}）</span>
            </div>
          )}
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
      )}
    </div>
  )
}
