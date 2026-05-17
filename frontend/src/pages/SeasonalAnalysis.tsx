import { useState, useEffect } from 'react'
import GVIChart from '../components/GVIChart'
import type { EChartsOption } from '../components/GVIChart'
import { fetchSeasonalAnalysis } from '../utils/api'
import { SEASON_LABELS, type Season } from '../types'

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
  const [metric, setMetric] = useState<'gvi' | 'cv' | 'stability'>('gvi')
  const [boxplot, setBoxplot] = useState<BoxplotData[]>([])
  const [summary, setSummary] = useState<SeasonalSummary[]>([])
  const [cvPoints, setCVPoints] = useState<CVPoint[]>([])
  const [stability, setStability] = useState<StabilityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSeasonalAnalysis()
      .then((data) => {
        setBoxplot(data.boxplot || [])
        setSummary(data.summary || [])
        setCVPoints(data.cv_points || [])
        setStability(data.stability || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

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
    xAxis: {
      type: 'category',
      data: boxplot.map((b) => SEASON_LABELS[b.season as Season] || b.season),
    },
    yAxis: { type: 'value', name: 'GVI (%)' },
    series: [
      {
        type: 'boxplot',
        data: boxplot.map((b) => [b.min_val, b.q1, b.median, b.q3, b.max_val]),
        itemStyle: { color: '#22c55e', borderColor: '#16a34a' },
      },
    ],
  }

  // 变异系数散点图（采样显示，最多2000点）
  const sampledCV = cvPoints.length > 2000
    ? cvPoints.filter((_, i) => i % Math.ceil(cvPoints.length / 2000) === 0)
    : cvPoints

  // 动态计算地图边界（从实际数据推导，不再硬编码南京经纬度）
  const cvLngs = sampledCV.map((p) => p.lng)
  const cvLats = sampledCV.map((p) => p.lat)
  const cvBounds = cvLngs.length > 0 ? {
    minLng: Math.min(...cvLngs),
    maxLng: Math.max(...cvLngs),
    minLat: Math.min(...cvLats),
    maxLat: Math.max(...cvLats),
  } : null

  const cvOption: EChartsOption = {
    title: { text: '季节变异系数(CV)分布', left: 'center' },
    tooltip: {
      formatter: (params: unknown) => {
        const d = (params as { data?: unknown[] }).data
        if (!d || d.length < 4) return ''
        return `CV: ${(d[2] as number).toFixed(1)}%<br/>平均GVI: ${(d[3] as number).toFixed(1)}%`
      },
    },
    visualMap: {
      min: 0,
      max: 80,
      calculable: true,
      inRange: { color: ['#22c55e', '#fbbf24', '#ef4444'] },
    },
    xAxis: {
      type: 'value',
      min: cvBounds ? cvBounds.minLng - 0.05 : undefined,
      max: cvBounds ? cvBounds.maxLng + 0.05 : undefined,
      name: '经度',
    },
    yAxis: {
      type: 'value',
      min: cvBounds ? cvBounds.minLat - 0.05 : undefined,
      max: cvBounds ? cvBounds.maxLat + 0.05 : undefined,
      name: '纬度',
    },
    series: [
      {
        type: 'scatter',
        data: sampledCV.map((p) => [p.lng, p.lat, p.cv, p.mean_gvi]),
        symbolSize: 6,
        itemStyle: { opacity: 0.7 },
      },
    ],
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">季节变异分析</h2>

      {/* Metric Selector */}
      <div className="flex gap-2">
        {([
          { key: 'gvi', label: 'GVI分布' },
          { key: 'cv', label: '变异系数' },
          { key: 'stability', label: '稳定性分区' },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              metric === m.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      {metric === 'gvi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <GVIChart option={boxplotOption} className="h-80" />
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">季节统计摘要</h3>
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
      )}

      {metric === 'cv' && (
        <div className="card">
          <GVIChart option={cvOption} className="h-96" />
        </div>
      )}

      {metric === 'stability' && stability && (
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
      )}
    </div>
  )
}
