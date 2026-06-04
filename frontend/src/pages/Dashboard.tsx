import { useEffect, useState } from 'react'
import { TreePine, MapPin, TrendingUp, Activity, AlertTriangle, ThumbsUp } from 'lucide-react'
import StatCard from '../components/StatCard'
import GVIChart from '../components/GVIChart'
import type { EChartsOption } from '../components/GVIChart'
import type { StatsResponse } from '../types'
import { fetchStats, fetchPlanningWeakAreas, fetchFeedbackStats } from '../utils/api'
import { SkeletonCard, SkeletonChart } from '../components/Skeleton'

interface PlanningStats {
  high_priority: number
  medium_priority: number
  low_priority: number
  estimated_trees: number
  estimated_gvi_improvement: number
}

// ECharts 统一主题色（与 Design Token 一致）
const CHART_COLORS = {
  primary: '#059669',   // primary-600
  accent: '#0891b2',    // accent-600
  success: '#16a34a',   // success-600
  warning: '#d97706',   // warning-600
  danger: '#dc2626',    // danger-600
  info: '#2563eb',     // info-600
  surface400: '#94a3b8', // surface-400
  surface600: '#475569', // surface-600
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [planningStats, setPlanningStats] = useState<PlanningStats | null>(null)
  const [feedbackUpRate, setFeedbackUpRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  // 监听暗色模式切换
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    Promise.all([
      fetchStats().catch((err) => { throw err }),
      fetchPlanningWeakAreas().then(d => d.stats).catch(() => null),
      fetchFeedbackStats().then(d => d.total > 0 ? d.up_rate : null).catch(() => null),
    ])
      .then(([data, planStats, upRate]) => {
        setStats(data)
        setPlanningStats(planStats)
        setFeedbackUpRate(upRate)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-28 bg-surface-200 dark:bg-surface-700 rounded" />
          <div className="h-4 w-48 bg-surface-100 dark:bg-surface-800 rounded mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart /><SkeletonChart />
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="card bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-500" />
          <div>
            <p className="font-medium text-danger-700 dark:text-danger-300">加载失败</p>
            <p className="text-sm text-danger-600 dark:text-danger-400 mt-0.5">{error || '未知错误'}</p>
          </div>
        </div>
      </div>
    )
  }

  // 计算平均GVI（四季加权平均）
  const totalSamples = stats.seasonal.reduce((s, x) => s + x.sample_count, 0)
  const avgGVI = totalSamples > 0
    ? stats.seasonal.reduce((s, x) => s + x.avg_gvi * x.sample_count, 0) / totalSamples
    : 0

  // 四季季节图表数据
  // 暗色模式配色（ECharts 无法使用 Tailwind class，需动态配色）
  const textMain = isDark ? '#e2e8f0' : '#475569'   // surface-200 / surface-600
  const textSub = isDark ? '#94a3b8' : '#94a3b8'     // surface-400 (两模式通用)
  const axisLine = isDark ? '#334155' : '#e2e8f0'    // surface-700 / surface-200

  const seasonalOption: EChartsOption = {
    title: { text: '四季平均GVI对比', left: 'center', textStyle: { fontSize: 14, color: textMain } },
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: stats.seasonal.map((s) => {
        const map: Record<string, string> = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }
        return map[s.season] || s.season
      }),
      name: '季节',
      axisLabel: { color: textMain },
      axisLine: { lineStyle: { color: axisLine } },
    },
    yAxis: { type: 'value', name: '平均GVI (%)', axisLabel: { color: textSub }, axisLine: { lineStyle: { color: axisLine } }, splitLine: { lineStyle: { color: axisLine } } },
    series: [
      {
        name: '平均GVI',
        type: 'bar',
        data: stats.seasonal.map((s) => s.avg_gvi),
        itemStyle: { color: CHART_COLORS.primary, borderRadius: [4, 4, 0, 0] },
        barWidth: '35%',
      },
      {
        name: '平均NDVI',
        type: 'bar',
        data: stats.seasonal.map((s) => s.avg_ndvi),
        itemStyle: { color: CHART_COLORS.accent, borderRadius: [4, 4, 0, 0] },
        barWidth: '35%',
      },
    ],
  }

  // 道路类型图表数据
  const roadTypeLabels: Record<string, string> = { rc1: '快速路', rc2: '主干道', rc3: '次干道', rc4: '支路' }
  const roadTypeKeys = Object.keys(stats.road_types)
  const maxCount = Math.max(...Object.values(stats.road_types))

  const roadTypeOption: EChartsOption = {
    title: { text: '道路类型采样点分布', left: 'center', textStyle: { fontSize: 14, color: textMain } },
    tooltip: {},
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: roadTypeKeys.map((k) => roadTypeLabels[k] || k),
      name: '道路类型',
      axisLabel: { color: textMain },
      axisLine: { lineStyle: { color: axisLine } },
    },
    yAxis: { type: 'value', name: '采样点数量', max: Math.ceil(maxCount / 10000) * 10000, axisLabel: { color: textSub }, axisLine: { lineStyle: { color: axisLine } }, splitLine: { lineStyle: { color: axisLine } } },
    series: [
      {
        name: '采样点数量',
        type: 'bar',
        data: roadTypeKeys.map((k) => stats.road_types[k]),
        itemStyle: {
          color: (params: unknown) => [CHART_COLORS.primary, CHART_COLORS.accent, CHART_COLORS.warning, CHART_COLORS.danger][(params as { dataIndex?: number }).dataIndex ?? 0],
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">系统总览</h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">城市绿视率智能规划系统 — 数据概览</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总采样点数"
          value={stats.total_points.toLocaleString()}
          icon={<MapPin className="w-5 h-5" />}
        />
        <StatCard
          title="平均GVI"
          value={avgGVI.toFixed(1)}
          unit="%"
          icon={<TreePine className="w-5 h-5" />}
        />
        <StatCard
          title="道路段数量"
          value={stats.total_roads.toLocaleString()}
          icon={<Activity className="w-5 h-5" />}
        />
        <StatCard
          title="夏季GVI峰值"
          value={stats.seasonal.find((s) => s.season === 'summer')?.avg_gvi.toFixed(1) || '—'}
          unit="%"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Planning & Feedback Overview */}
      {planningStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-l-4 border-danger-400 flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-danger-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400 font-medium">高优先级区域</p>
              <p className="text-xl font-bold text-danger-600 dark:text-danger-400">{planningStats.high_priority.toLocaleString()}</p>
            </div>
          </div>
          <div className="card border-l-4 border-warning-400 flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-warning-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400 font-medium">中优先级区域</p>
              <p className="text-xl font-bold text-warning-600 dark:text-warning-400">{planningStats.medium_priority.toLocaleString()}</p>
            </div>
          </div>
          <div className="card border-l-4 border-info-400 flex items-center gap-3">
            <TreePine className="w-7 h-7 text-info-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400 font-medium">预估补植树苗</p>
              <p className="text-xl font-bold text-info-600 dark:text-info-400">{planningStats.estimated_trees.toLocaleString()}</p>
            </div>
          </div>
          <div className="card border-l-4 border-success-400 flex items-center gap-3">
            <ThumbsUp className="w-7 h-7 text-success-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-surface-500 dark:text-surface-400 font-medium">AI建议好评率</p>
              <p className="text-xl font-bold text-success-600 dark:text-success-400">
                {feedbackUpRate !== null ? `${Math.round(feedbackUpRate * 100)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <GVIChart option={seasonalOption} className="h-80" />
        </div>
        <div className="card">
          <GVIChart option={roadTypeOption} className="h-80" />
        </div>
      </div>

      {/* Seasonal Summary Table */}
      <div className="card">
        <h3 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-4">季节数据统计</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700">
                <th className="text-left py-2.5 text-surface-500 dark:text-surface-400 font-medium text-xs">季节</th>
                <th className="text-right py-2.5 text-surface-500 dark:text-surface-400 font-medium text-xs">平均GVI</th>
                <th className="text-right py-2.5 text-surface-500 dark:text-surface-400 font-medium text-xs">平均NDVI</th>
                <th className="text-right py-2.5 text-surface-500 dark:text-surface-400 font-medium text-xs">有效样本</th>
              </tr>
            </thead>
            <tbody>
              {stats.seasonal.map((s) => {
                const labels: Record<string, string> = { spring: '🌸 春季', summer: '☀️ 夏季', autumn: '🍂 秋季', winter: '❄️ 冬季' }
                return (
                  <tr key={s.season} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                    <td className="py-2.5 text-surface-700 dark:text-surface-200">{labels[s.season] || s.season}</td>
                    <td className="text-right font-medium text-surface-900 dark:text-surface-50">{s.avg_gvi.toFixed(2)}</td>
                    <td className="text-right text-surface-600 dark:text-surface-300">{s.avg_ndvi.toFixed(2)}</td>
                    <td className="text-right text-surface-600 dark:text-surface-300">{s.sample_count.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
