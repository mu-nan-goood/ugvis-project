import { useState, useEffect, useMemo } from 'react'
import GVIChart from '../components/GVIChart'
import GVIMap from '../components/GVIMap'
import type { EChartsOption } from '../components/GVIChart'
import { fetchSeasonalAnalysis, fetchSeasonalMap } from '../utils/api'
import { SEASON_LABELS, type Season, type MapPoint } from '../types'
import { SkeletonChart, SkeletonMap } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

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

type MetricKey = 'gvi' | 'cv' | 'stability' | 'diff' | 'maps'

type RoadType = 'rc1' | 'rc2' | 'rc3' | 'rc4'
const ROAD_TYPE_LABELS: Record<string, string> = {
  rc1: 'RC1 快速路',
  rc2: 'RC2 主干路',
  rc3: 'RC3 次干路',
  rc4: 'RC4 支路',
}

export default function SeasonalAnalysis() {
  const [metric, setMetric] = useState<MetricKey>('gvi')
  const [boxplot, setBoxplot] = useState<BoxplotData[]>([])
  const [summary, setSummary] = useState<SeasonalSummary[]>([])
  const [cvPoints, setCvPoints] = useState<CVPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seasonMapData, setSeasonMapData] = useState<Record<string, MapPoint[]>>({})
  const [selectedSeason, setSelectedSeason] = useState<Season>('spring')
  const [seasonMapLoading, setSeasonMapLoading] = useState(false)
  const [roadTypeFilter, setRoadTypeFilter] = useState<Set<RoadType>>(new Set(['rc1', 'rc2', 'rc3', 'rc4']))
  const [stabilityThresholdLow, setStabilityThresholdLow] = useState(25)
  const [stabilityThresholdHigh, setStabilityThresholdHigh] = useState(50)

  useEffect(() => {
    fetchSeasonalAnalysis()
      .then((data) => {
        setBoxplot(data.boxplot || [])
        setSummary(data.summary || [])
        setCvPoints(data.cv_points || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Fetch seasonal map data when maps tab is active
  useEffect(() => {
    if (metric !== 'maps') return
    if (seasonMapData[selectedSeason]) return  // already loaded
    setSeasonMapLoading(true)
    fetchSeasonalMap(selectedSeason, 3000)
      .then((data) => {
        const pts: MapPoint[] = (data.points || []).map((p: { lat: number; lng: number; gvi: number; road_type: string | null }, i: number) => ({
          id: i,
          lat: p.lat,
          lng: p.lng,
          gvi: p.gvi,
          ndvi: null,
          road_type: p.road_type,
        }))
        setSeasonMapData((prev) => ({ ...prev, [selectedSeason]: pts }))
        setSeasonMapLoading(false)
      })
      .catch(() => {
        setSeasonMapLoading(false)
      })
  }, [metric, selectedSeason, seasonMapData])

  // Filtered cvPoints by road type
  const filteredCvPoints = useMemo(() => {
    if (roadTypeFilter.size === 4) return cvPoints
    return cvPoints.filter((p) => p.road_type && roadTypeFilter.has(p.road_type as RoadType))
  }, [cvPoints, roadTypeFilter])

  // CV points → MapPoint for heatmap
  const cvMapPoints: MapPoint[] = useMemo(() => {
    const sampled = filteredCvPoints.length > 2000
      ? filteredCvPoints.filter((_, i) => i % Math.ceil(filteredCvPoints.length / 2000) === 0)
      : filteredCvPoints
    return sampled.map((p, i) => ({
      id: i,
      point_id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.cv,
      ndvi: p.mean_gvi,
      road_type: p.road_type,
    }))
  }, [filteredCvPoints])

  // Stability zone points → MapPoint for 3-color map
  const stabilityMapPoints: MapPoint[] = useMemo(() => {
    const sampled = filteredCvPoints.length > 2000
      ? filteredCvPoints.filter((_, i) => i % Math.ceil(filteredCvPoints.length / 2000) === 0)
      : filteredCvPoints
    return sampled.map((p, i) => {
      const stabilityScore = p.cv < stabilityThresholdLow ? 80 + (stabilityThresholdLow - p.cv) : p.cv < stabilityThresholdHigh ? 40 + (stabilityThresholdHigh - p.cv) * 1.6 : Math.max(0, 40 - p.cv)
      return {
        id: i,
        point_id: i,
        lat: p.lat,
        lng: p.lng,
        gvi: stabilityScore,
        ndvi: null,
        road_type: p.road_type,
      }
    })
  }, [filteredCvPoints, stabilityThresholdLow, stabilityThresholdHigh])

  // Dynamic stability stats based on thresholds and road filter
  const dynamicStability = useMemo(() => {
    const pts = filteredCvPoints
    const stable = pts.filter((p) => p.cv < stabilityThresholdLow).length
    const moderate = pts.filter((p) => p.cv >= stabilityThresholdLow && p.cv < stabilityThresholdHigh).length
    const unstable = pts.filter((p) => p.cv >= stabilityThresholdHigh).length
    const total = pts.length || 1
    return {
      stable,
      moderate,
      unstable,
      stable_pct: ((stable / total) * 100).toFixed(1),
      moderate_pct: ((moderate / total) * 100).toFixed(1),
      unstable_pct: ((unstable / total) * 100).toFixed(1),
    }
  }, [filteredCvPoints, stabilityThresholdLow, stabilityThresholdHigh])

  // Summer-Winter diff points → MapPoint
  const diffMapPoints: MapPoint[] = useMemo(() => {
    const diffData = filteredCvPoints.filter((p) => p.summer_winter_diff !== null)
    const sampled = diffData.length > 2000
      ? diffData.filter((_, i) => i % Math.ceil(diffData.length / 2000) === 0)
      : diffData
    return sampled.map((p, i) => ({
      id: i,
      point_id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.summer_winter_diff,
      ndvi: p.mean_gvi,
      road_type: p.road_type,
    }))
  }, [filteredCvPoints])

  // 季节差值统计
  const diffStats = useMemo(() => {
    const diffs = filteredCvPoints
      .map((p) => p.summer_winter_diff)
      .filter((d): d is number => d !== null)
    if (diffs.length === 0) return null
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
    const maxD = Math.max(...diffs)
    const minD = Math.min(...diffs)
    const positive = diffs.filter((d) => d > 0).length
    return { avg, max: maxD, min: minD, count: diffs.length, positive, positivePct: (positive / diffs.length * 100).toFixed(1) }
  }, [filteredCvPoints])

  // 稳定性饼图 — 必须在 early return 之前（Hooks 顺序铁律）
  const stabilityPieOption: EChartsOption = useMemo(() => ({
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
        data: [
          { value: dynamicStability.stable, name: '稳定区', itemStyle: { color: '#22c55e' } },
          { value: dynamicStability.moderate, name: '中等波动', itemStyle: { color: '#f59e0b' } },
          { value: dynamicStability.unstable, name: '不稳定区', itemStyle: { color: '#ef4444' } },
        ],
      },
    ],
  }), [dynamicStability])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-32 bg-surface-200 dark:bg-surface-700 rounded" />
          <div className="h-4 w-56 bg-surface-100 dark:bg-surface-800 rounded mt-2" />
        </div>
        <div className="flex gap-1">
          {[1,2,3,4,5].map(i => <div key={i} className="h-9 w-24 bg-surface-100 dark:bg-surface-800 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart /><SkeletonChart />
        </div>
        <SkeletonMap />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800">
        <p className="text-danger-600 dark:text-danger-400">加载失败: {error}</p>
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">季节变异分析</h2>
        <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
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
          { key: 'maps', label: '四季地图', icon: '🗺️' },
        ] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-1.5 ${
              metric === m.key
                ? 'bg-primary-600 text-white shadow-soft'
                : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
            }`}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Road Type Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-surface-500 dark:text-surface-400 font-medium">🛣️ 道路类型筛选：</span>
        {(['rc1', 'rc2', 'rc3', 'rc4'] as const).map((rt) => (
          <button
            key={rt}
            onClick={() => {
              setRoadTypeFilter((prev) => {
                const next = new Set(prev)
                if (next.has(rt)) next.delete(rt); else next.add(rt)
                return next
              })
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
              roadTypeFilter.has(rt)
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-surface-400 dark:text-surface-500 border-surface-300 dark:border-surface-600 hover:border-gray-400'
            }`}
          >
            {ROAD_TYPE_LABELS[rt]}
          </button>
        ))}
        {roadTypeFilter.size < 4 && (
          <button
            onClick={() => setRoadTypeFilter(new Set(['rc1', 'rc2', 'rc3', 'rc4']))}
            className="text-xs text-primary-600 hover:underline"
          >
            重置
          </button>
        )}
        <span className="text-xs text-surface-400 ml-auto">
          {filteredCvPoints.length.toLocaleString()} / {cvPoints.length.toLocaleString()} 采样点
        </span>
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
              <span className="text-sm text-surface-400 dark:text-surface-500">
                {cvMapPoints.length.toLocaleString()} 个采样点 · 绿(CV低) → 红(CV高)
              </span>
            </div>
            <GVIMap
              points={cvMapPoints}
              season="spring"
              displayMode="heatmap"
              valueRange={[0, 100]}
              colorScheme="cv"
              preferCanvas={false}
              className="h-[500px] rounded-lg"
            />
            <p className="text-xs text-surface-400 mt-2">
              颜色越绿表示季节稳定性越高(CV越低)，颜色越红表示波动越大(CV越高)。点击采样点查看详情。
            </p>
          </div>
        </div>
      )}

      {/* Stability Tab */}
      {metric === 'stability' && (
        <div className="space-y-6">
          {/* Threshold Slider */}
          <div className="card bg-gradient-to-r from-slate-50 to-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">🎛️ 稳定性阈值调节</h4>
              <span className="text-xs text-surface-400 dark:text-surface-500">拖动滑块调整分区阈值，地图和统计实时更新</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs text-surface-500 dark:text-surface-400 flex items-center justify-between">
                  <span>稳定 / 中等 分界 (CV%)</span>
                  <span className="font-mono font-bold text-success-700 dark:text-success-400">{stabilityThresholdLow}%</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={stabilityThresholdLow}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setStabilityThresholdLow(v)
                    if (v >= stabilityThresholdHigh) setStabilityThresholdHigh(Math.min(v + 5, 80))
                  }}
                  className="w-full h-2 bg-gradient-to-r from-green-300 to-yellow-300 rounded-lg appearance-none cursor-pointer accent-green-600"
                />
              </div>
              <div>
                <label className="text-xs text-surface-500 dark:text-surface-400 flex items-center justify-between">
                  <span>中等 / 不稳定 分界 (CV%)</span>
                  <span className="font-mono font-bold text-danger-700 dark:text-danger-400">{stabilityThresholdHigh}%</span>
                </label>
                <input
                  type="range"
                  min={15}
                  max={80}
                  step={1}
                  value={stabilityThresholdHigh}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setStabilityThresholdHigh(v)
                    if (v <= stabilityThresholdLow) setStabilityThresholdLow(Math.max(v - 5, 5))
                  }}
                  className="w-full h-2 bg-gradient-to-r from-yellow-300 to-red-300 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card border-l-4 border-success-500">
              <h3 className="text-lg font-semibold text-success-700 dark:text-success-400">稳定区</h3>
              <p className="text-3xl font-bold mt-2">{dynamicStability.stable.toLocaleString()}</p>
              <p className="text-sm text-surface-400 dark:text-surface-500">采样点数 ({dynamicStability.stable_pct}%)</p>
              <p className="text-sm mt-2">CV &lt; {stabilityThresholdLow}%，四季GVI变化小</p>
            </div>
            <div className="card border-l-4 border-warning-500">
              <h3 className="text-lg font-semibold text-warning-700 dark:text-warning-400">中等波动区</h3>
              <p className="text-3xl font-bold mt-2">{dynamicStability.moderate.toLocaleString()}</p>
              <p className="text-sm text-surface-400 dark:text-surface-500">采样点数 ({dynamicStability.moderate_pct}%)</p>
              <p className="text-sm mt-2">CV {stabilityThresholdLow}-{stabilityThresholdHigh}%，季节变化明显</p>
            </div>
            <div className="card border-l-4 border-danger-500">
              <h3 className="text-lg font-semibold text-danger-700 dark:text-danger-400">不稳定区</h3>
              <p className="text-3xl font-bold mt-2">{dynamicStability.unstable.toLocaleString()}</p>
              <p className="text-sm text-surface-400 dark:text-surface-500">采样点数 ({dynamicStability.unstable_pct}%)</p>
              <p className="text-sm mt-2">CV &gt; {stabilityThresholdHigh}%，冬季GVI急剧下降</p>
            </div>
          </div>
          {/* Pie Chart + Map */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <GVIChart option={stabilityPieOption} className="h-80" />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">稳定性分区地图</h3>
                <span className="text-sm text-surface-400 dark:text-surface-500">绿(稳定) → 黄(中等) → 红(不稳定)</span>
              </div>
              <GVIMap
                points={stabilityMapPoints}
                season="spring"
                displayMode="heatmap"
                valueRange={[0, 100]}
                colorScheme="cv"
                preferCanvas={false}
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
                <p className="text-xs text-surface-400 dark:text-surface-500">夏 &gt; 冬</p>
              </div>
              <div className="card bg-gradient-to-r from-red-50 to-pink-50 border-red-200">
                <p className="text-sm text-danger-600 dark:text-danger-400">最大差值</p>
                <p className="text-2xl font-bold text-danger-700 dark:text-danger-400">+{diffStats.max.toFixed(1)}%</p>
                <p className="text-xs text-surface-400 dark:text-surface-500">夏冬极差</p>
              </div>
              <div className="card bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
                <p className="text-sm text-blue-600">最小差值</p>
                <p className="text-2xl font-bold text-blue-700">{diffStats.min.toFixed(1)}%</p>
                <p className="text-xs text-surface-400 dark:text-surface-500">含负值=冬&gt;夏</p>
              </div>
              <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                <p className="text-sm text-success-600 dark:text-success-400">夏&gt;冬占比</p>
                <p className="text-2xl font-bold text-success-700 dark:text-success-400">{diffStats.positivePct}%</p>
                <p className="text-xs text-surface-400 dark:text-surface-500">{diffStats.positive}/{diffStats.count} 点</p>
              </div>
            </div>
          )}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">夏冬GVI差值空间分布</h3>
              <span className="text-sm text-surface-400 dark:text-surface-500">
                {diffMapPoints.length.toLocaleString()} 个采样点 · 绿(夏&gt;冬) → 红(冬&gt;夏)
              </span>
            </div>
            <GVIMap
              points={diffMapPoints}
              season="spring"
              displayMode="heatmap"
              valueRange={[-20, 50]}
              colorScheme="diverging"
              preferCanvas={false}
              className="h-[500px] rounded-lg"
            />
            <p className="text-xs text-surface-400 mt-2">
              颜色反映夏季GVI与冬季GVI的差值。正值(绿)表示夏季绿化覆盖率更高，负值(红)表示冬季反而更高。
              差值越大的区域，季节性绿化变化越剧烈，是需要优先考虑常绿植被补植的重点区域。
            </p>
          </div>
        </div>
      )}

      {/* Seasonal Maps Tab */}
      {metric === 'maps' && (
        <div className="space-y-4">
          {/* Season Selector */}
          <div className="flex gap-2">
            {(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSeason(s)}
                className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                  selectedSeason === s
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-surface-200 dark:border-surface-700'
                }`}
              >
                {SEASON_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Season Map */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{SEASON_LABELS[selectedSeason]} GVI 空间分布</h3>
              <span className="text-sm text-surface-400 dark:text-surface-500">
                {(seasonMapData[selectedSeason]?.length || 0).toLocaleString()} 个采样点 · 绿(高GVI) → 黄(低GVI)
              </span>
            </div>
            {seasonMapLoading ? (
              <div className="flex items-center justify-center h-[500px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
              </div>
            ) : seasonMapData[selectedSeason] ? (
              <GVIMap
                points={seasonMapData[selectedSeason]}
                season={selectedSeason}
                displayMode="heatmap"
                valueRange={[0, 80]}
                colorScheme="gvi"
                preferCanvas={false}
                className="h-[500px] rounded-lg"
              />
            ) : (
              <EmptyState
                icon={<span className="text-5xl">🗺️</span>}
                title="选择季节加载地图"
                description="点击上方季节按钮，加载该季节的GVI空间分布数据"
              />
            )}
            <p className="text-xs text-surface-400 mt-2">
              展示{SEASON_LABELS[selectedSeason]}各采样点绿视率(GVI)的空间分布，颜色越绿表示绿化覆盖率越高。
              切换季节可对比不同季节的GVI空间格局差异。
            </p>
          </div>

          {/* Quick comparison cards */}
          {summary.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {summary.map((s) => (
                <button
                  key={s.season}
                  onClick={() => setSelectedSeason(s.season as Season)}
                  className={`card text-left transition-all hover:shadow-md ${
                    selectedSeason === s.season ? 'ring-2 ring-primary-500' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-surface-500 dark:text-surface-400">{SEASON_LABELS[s.season as Season]}</p>
                  <p className="text-2xl font-bold mt-1">{s.mean.toFixed(1)}%</p>
                  <p className="text-xs text-surface-400">均值 GVI · CV {s.cv.toFixed(1)}%</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
