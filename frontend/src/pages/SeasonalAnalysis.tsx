import { useState, useEffect, useMemo } from 'react'
import GVIChart from '../components/GVIChart'
import GVIMap from '../components/GVIMap'
import type { EChartsOption } from '../components/GVIChart'
import { fetchSeasonalAnalysis } from '../utils/api'
import { SEASON_LABELS, type Season, type MapPoint } from '../types'

interface BoxplotData {
  season: string
  min_val: number
  q1: number
  median: number
  q3: number
  max_val: number
  outliers: number[]
}

interface SeasonalSummary {
  season: string
  min_val: number
  median: number
  max_val: number
  mean: number
  std: number
  cv: number
  sample_count: number
}

interface CVPoint {
  lat: number
  lng: number
  cv: number
  mean_gvi: number
  road_type: string | null
  summer_winter_diff: number | null
}

interface StabilityStats {
  stable: number
  moderate: number
  unstable: number
  stable_pct: number
  moderate_pct: number
  unstable_pct: number
}

export default function SeasonalAnalysis() {
  const [metric, setMetric] = useState<'gvi' | 'cv' | 'stability' | 'diff'>('gvi')
  const [boxplot, setBoxplot] = useState<BoxplotData[]>([])
  const [summary, setSummary] = useState<SeasonalSummary[]>([])
  const [cvPoints, setCvPoints] = useState<CVPoint[]>([])
  const [stability, setStability] = useState<StabilityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSeasonalAnalysis()
      .then((data) => {
        setBoxplot(data.boxplot || [])
        setSummary(data.summary || [])
        setCvPoints(data.cv_points || [])
        setStability(data.stability || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // CV points → MapPoint for heatmap
  const cvMapPoints: MapPoint[] = useMemo(() => {
    const sampled = cvPoints.length > 2000
      ? cvPoints.filter((_, i) => i % Math.ceil(cvPoints.length / 2000) === 0)
      : cvPoints
    return sampled.map((p, i) => ({
      id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.cv,        // gvi field used for CV value (drives color)
      ndvi: p.mean_gvi,  // ndvi field used for mean GVI
      road_type: p.road_type,
    }))
  }, [cvPoints])

  // Stability zone points → MapPoint for 3-color map
  const stabilityMapPoints: MapPoint[] = useMemo(() => {
    const sampled = cvPoints.length > 2000
      ? cvPoints.filter((_, i) => i % Math.ceil(cvPoints.length / 2000) === 0)
      : cvPoints
    return sampled.map((p, i) => {
      // Map stability zones to GVI-like values for color gradient:
      // stable (CV<25) → high value (green), moderate (25-50) → mid, unstable (>50) → low (red)
      const stabilityScore = p.cv < 25 ? 80 + (25 - p.cv) : p.cv < 50 ? 40 + (50 - p.cv) * 1.6 : Math.max(0, 40 - p.cv)
      return {
        id: i,
        lat: p.lat,
        lng: p.lng,
        gvi: stabilityScore,
        ndvi: null,
        road_type: p.road_type,
      }
    })
  }, [cvPoints])

  // Summer-Winter diff points → MapPoint
  const diffMapPoints: MapPoint[] = useMemo(() => {
    const diffData = cvPoints.filter((p) => p.summer_winter_diff !== null)
    const sampled = diffData.length > 2000
      ? diffData.filter((_, i) => i % Math.ceil(diffData.length / 2000) === 0)
      : diffData
    return sampled.map((p, i) => ({
      id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.summer_winter_diff, // positive = summer higher, negative = winter higher
      ndvi: p.mean_gvi,
      road_type: p.road_type,
    }))
  }, [cvPoints])

  // 季节差值统计 — must be before any early return (Rules of Hooks)
  const diffStats = useMemo(() => {
    const diffs = cvPoints
      .map((p) => p.summer_winter_diff)
      .filter((d): d is number => d !== null)
    if (diffs.length === 0) return null
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
    const maxD = Math.max(...diffs)
    const minD = Math.min(...diffs)
    const positive = diffs.filter((d) => d > 0).length
    return { avg, max: maxD, min: minD, count: diffs.length, positive, positivePct: (positive / diffs.length * 100).toFixed(1) }
  }, [cvPoints])

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

  // 箱线图
  const boxplotOption: EChartsOption = {
    title: { text: '四季GVI箱线图', left: 'center' },
    tooltip: { trigger: 'item' },
    toolbox: {
      feature: { saveAsImage: { title: '导出' } },
      right: 10,
      top: 0,
    },
    grid: { left: '12%', right: '8%', bottom: '12%', top: '15%' },
    xAxis: {
      type: 'category',
      data: boxplot.map((b) => SEASON_LABELS[b.season as Season] || b.season),
    },
    yAxis: {
      type: 'value',
      name: 'GVI (%)',
      min: (value: { min: number }) => Math.floor(value.min / 5) * 5,
    },
    series: [
      {
        type: 'boxplot',
        data: boxplot.map((b) => [b.min_val, b.q1, b.median, b.q3, b.max_val]),
        itemStyle: { color: '#22c55e', borderColor: '#16a34a' },
        boxWidth: ['30%', '70%'],
      },
    ],
  }

  // 趋势折线图
  const trendOption: EChartsOption = {
    title: { text: '四季GVI变化趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    toolbox: {
      feature: { saveAsImage: { title: '导出' } },
      right: 10,
      top: 0,
    },
    legend: { data: ['均值', '中位数'], bottom: 0 },
    grid: { left: '10%', right: '5%', bottom: '15%', top: '15%' },
    xAxis: {
      type: 'category',
      data: summary.map((s) => SEASON_LABELS[s.season as Season] || s.season),
    },
    yAxis: { type: 'value', name: 'GVI (%)' },
    series: [
      {
        name: '均值',
        type: 'line',
        data: summary.map((s) => s.mean),
        smooth: true,
        itemStyle: { color: '#22c55e' },
        lineStyle: { width: 3 },
        symbolSize: 8,
        areaStyle: { color: 'rgba(34, 197, 94, 0.1)' },
      },
      {
        name: '中位数',
        type: 'line',
        data: summary.map((s) => s.median),
        smooth: true,
        itemStyle: { color: '#3b82f6' },
        lineStyle: { width: 3, type: 'dashed' },
        symbolSize: 8,
      },
    ],
  }

  // 稳定性饼图
  const stabilityPieOption: EChartsOption = {
    title: { text: '稳定性分区占比', left: 'center' },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    toolbox: {
      feature: { saveAsImage: { title: '导出' } },
      right: 10,
      top: 0,
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{d}%' },
        data: stability
          ? [
              { value: stability.stable, name: '稳定区', itemStyle: { color: '#22c55e' } },
              { value: stability.moderate, name: '中等波动', itemStyle: { color: '#f59e0b' } },
              { value: stability.unstable, name: '不稳定区', itemStyle: { color: '#ef4444' } },
            ]
          : [],
      },
    ],
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">季节变异分析</h2>
        <p className="text-sm text-gray-500 mt-1">
          分析城市绿视率的季节波动特征，识别季节稳定性分区与夏冬差值空间格局
        </p>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'gvi', label: 'GVI分布', icon: '📊' },
          { key: 'cv', label: '变异系数', icon: '🗺️' },
          { key: 'stability', label: '稳定性分区', icon: '🛡️' },
          { key: 'diff', label: '夏冬差值', icon: '🔄' },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
              metric === m.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* GVI Distribution Tab */}
      {metric === 'gvi' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <GVIChart option={boxplotOption} className="h-80" />
            </div>
            <div className="card">
              <GVIChart option={trendOption} className="h-80" />
            </div>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">季节统计摘要</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">统计量</th>
                    {summary.map((s) => (
                      <th key={s.season} className="text-right py-2">
                        {SEASON_LABELS[s.season as Season] || s.season}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2">最小值</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right">{s.min_val.toFixed(1)}%</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">中位数</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right">{s.median.toFixed(1)}%</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">最大值</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right">{s.max_val.toFixed(1)}%</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">均值</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right">{s.mean.toFixed(1)}%</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">标准差</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right">{s.std.toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2">变异系数</td>
                    {summary.map((s) => (
                      <td key={s.season} className="text-right font-medium">{s.cv.toFixed(1)}%</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CV Map Tab */}
      {metric === 'cv' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">季节变异系数(CV)地图分布</h3>
              <span className="text-sm text-gray-500">
                {cvMapPoints.length.toLocaleString()} 个采样点 · 绿(CV低) → 红(CV高)
              </span>
            </div>
            <GVIMap
              points={cvMapPoints}
              season="spring"
              displayMode="heatmap"
              className="h-[500px] rounded-lg"
            />
            <p className="text-xs text-gray-400 mt-2">
              颜色越绿表示季节稳定性越高(CV越低)，颜色越红表示波动越大(CV越高)。点击采样点查看详情。
            </p>
          </div>
        </div>
      )}

      {/* Stability Tab */}
      {metric === 'stability' && stability && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card border-l-4 border-green-500">
              <h3 className="text-lg font-semibold text-green-700">稳定区</h3>
              <p className="text-3xl font-bold mt-2">{stability.stable.toLocaleString()}</p>
              <p className="text-sm text-gray-500">采样点数 ({stability.stable_pct}%)</p>
              <p className="text-sm mt-2">CV &lt; 25%，四季GVI变化小</p>
            </div>
            <div className="card border-l-4 border-yellow-500">
              <h3 className="text-lg font-semibold text-yellow-700">中等波动区</h3>
              <p className="text-3xl font-bold mt-2">{stability.moderate.toLocaleString()}</p>
              <p className="text-sm text-gray-500">采样点数 ({stability.moderate_pct}%)</p>
              <p className="text-sm mt-2">CV 25-50%，季节变化明显</p>
            </div>
            <div className="card border-l-4 border-red-500">
              <h3 className="text-lg font-semibold text-red-700">不稳定区</h3>
              <p className="text-3xl font-bold mt-2">{stability.unstable.toLocaleString()}</p>
              <p className="text-sm text-gray-500">采样点数 ({stability.unstable_pct}%)</p>
              <p className="text-sm mt-2">CV &gt; 50%，冬季GVI急剧下降</p>
            </div>
          </div>
          {/* Pie Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <GVIChart option={stabilityPieOption} className="h-80" />
            </div>
            {/* Stability Map */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">稳定性分区地图</h3>
                <span className="text-sm text-gray-500">绿(稳定) → 黄(中等) → 红(不稳定)</span>
              </div>
              <GVIMap
                points={stabilityMapPoints}
                season="spring"
                displayMode="heatmap"
                className="h-72 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Summer-Winter Difference Tab */}
      {metric === 'diff' && (
        <div className="space-y-6">
          {diffStats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
                <p className="text-sm text-orange-600">平均差值</p>
                <p className="text-2xl font-bold text-orange-700">+{diffStats.avg.toFixed(1)}%</p>
                <p className="text-xs text-gray-500">夏 &gt; 冬</p>
              </div>
              <div className="card bg-gradient-to-r from-red-50 to-pink-50 border-red-200">
                <p className="text-sm text-red-600">最大差值</p>
                <p className="text-2xl font-bold text-red-700">+{diffStats.max.toFixed(1)}%</p>
                <p className="text-xs text-gray-500">夏冬极差</p>
              </div>
              <div className="card bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
                <p className="text-sm text-blue-600">最小差值</p>
                <p className="text-2xl font-bold text-blue-700">{diffStats.min.toFixed(1)}%</p>
                <p className="text-xs text-gray-500">含负值=冬&gt;夏</p>
              </div>
              <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                <p className="text-sm text-green-600">夏&gt;冬占比</p>
                <p className="text-2xl font-bold text-green-700">{diffStats.positivePct}%</p>
                <p className="text-xs text-gray-500">{diffStats.positive}/{diffStats.count} 点</p>
              </div>
            </div>
          )}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">夏冬GVI差值空间分布</h3>
              <span className="text-sm text-gray-500">
                {diffMapPoints.length.toLocaleString()} 个采样点 · 绿(夏&gt;冬) → 红(冬&gt;夏)
              </span>
            </div>
            <GVIMap
              points={diffMapPoints}
              season="spring"
              displayMode="heatmap"
              className="h-[500px] rounded-lg"
            />
            <p className="text-xs text-gray-400 mt-2">
              颜色反映夏季GVI与冬季GVI的差值。正值(绿)表示夏季绿化覆盖率更高，负值(红)表示冬季反而更高。
              差值越大的区域，季节性绿化变化越剧烈，是需要优先考虑常绿植被补植的重点区域。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
