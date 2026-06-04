import { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import GVIChart from '../components/GVIChart'
import GVIMap from '../components/GVIMap'
import type { EChartsOption } from '../components/GVIChart'
import { fetchAnalysisModels, fetchAnalysisScatter, fetchAnalysisResiduals } from '../utils/api'
import type { MapPoint } from '../types'
import { SkeletonChart, SkeletonMap } from '../components/Skeleton'

// Session-level cache to avoid re-fetching on route changes
const CACHE_KEY_MODELS = 'ugvis:analysis:models'
const CACHE_KEY_SCATTER = 'ugvis:analysis:scatter'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) { sessionStorage.removeItem(key); return null }
    return data as T
  } catch { return null }
}

function setCache<T>(key: string, data: T): void {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
}

interface ModelMetrics {
  model_type: string
  r2: number
  adj_r2: number
  rmse: number
  aicc: number
  ndvi_coef: string
  intercept: string
  is_estimated?: boolean
}

interface LocalR2Point {
  lat: number
  lng: number
  local_r2: number
  model_type?: string | null
}

interface ScatterPointData {
  ndvi: number
  gvi: number
  road_type: string | null
}

interface RegressionLineData {
  model_type: string
  slope: number
  intercept: number
  r2: number
  color: string
}

interface ResidualData {
  predicted_vs_actual: { predicted: number; actual: number; residual: number }[]
  residual_map: { lat: number; lng: number; residual: number; std_residual: number | null }[]
  summary: {
    model_type: string
    season: string
    count: number
    mean_residual: number
    std_residual: number
    max_residual: number
    min_residual: number
    total_available: number
  }
}

const MODEL_LABELS: Record<string, string> = {
  lr: '线性回归 (LR)',
  gwr: '地理加权回归 (GWR)',
  mgwr: '多尺度GWR (MGWR)',
}

/** Parse a coefficient string like "0.52" or "0.42~0.94" into {min, max, mid} */
function parseCoef(val: string): { min: number; max: number; mid: number } | null {
  if (!val || val === 'N/A') return null
  if (val.includes('~')) {
    const [a, b] = val.split('~').map(Number)
    if (isNaN(a) || isNaN(b)) return null
    return { min: Math.min(a, b), max: Math.max(a, b), mid: (a + b) / 2 }
  }
  const n = Number(val)
  if (isNaN(n)) return null
  return { min: n, max: n, mid: n }
}

/** Render a coefficient as a horizontal bar with value label */
function CoefBar({ value, color, domain }: { value: string; color: string; domain: [number, number] }) {
  const parsed = parseCoef(value)
  if (!parsed) return <span className="text-gray-400">{value}</span>

  const [dMin, dMax] = domain
  const dRange = dMax - dMin || 1
  // Normalize positions to 0..100%
  const leftPct = Math.max(0, Math.min(100, ((parsed.min - dMin) / dRange) * 100))
  const rightPct = Math.max(0, Math.min(100, ((parsed.max - dMin) / dRange) * 100))
  const widthPct = Math.max(rightPct - leftPct, 4) // min 4% width for single value
  const isRange = parsed.min !== parsed.max

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="relative flex-1 h-5 bg-gray-100 rounded overflow-hidden">
        <div
          className="absolute top-0 h-full rounded transition-all duration-300"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            backgroundColor: color,
            opacity: 0.7,
          }}
        />
        <div
          className="absolute top-0 h-full flex items-center justify-center text-xs font-semibold w-full"
          style={{ color: parsed.mid >= (dMin + dMax) / 2 ? '#fff' : '#333' }}
        >
          {isRange ? value : parsed.mid.toFixed(2)}
        </div>
      </div>
    </div>
  )
}


export default function Analysis() {
  const [activeModel, setActiveModel] = useState<'lr' | 'gwr' | 'mgwr'>('mgwr')
  const [models, setModels] = useState<ModelMetrics[]>([])
  const [localR2Points, setLocalR2Points] = useState<LocalR2Point[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scatterData, setScatterData] = useState<{ points: ScatterPointData[]; regression_lines: RegressionLineData[] }>({ points: [], regression_lines: [] })
  const [residualData, setResidualData] = useState<ResidualData | null>(null)
  const modelsFetchedRef = useRef(false)

  useEffect(() => {
    // Try session cache first (stale-while-revalidate)
    const cached = getCached<{ models: ModelMetrics[]; local_r2_points: LocalR2Point[] }>(CACHE_KEY_MODELS)
    if (cached) {
      setModels(cached.models || [])
      setLocalR2Points(cached.local_r2_points || [])
      setLoading(false)
      // Background revalidation
      if (!modelsFetchedRef.current) {
        modelsFetchedRef.current = true
        fetchAnalysisModels().then((data) => {
          setModels(data.models || [])
          setLocalR2Points(data.local_r2_points || [])
          setCache(CACHE_KEY_MODELS, data)
        }).catch(() => {})
      }
      return
    }
    fetchAnalysisModels()
      .then((data) => {
        setModels(data.models || [])
        setLocalR2Points(data.local_r2_points || [])
        setCache(CACHE_KEY_MODELS, data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Fetch scatter data
  useEffect(() => {
    const cached = getCached<{ points: ScatterPointData[]; regression_lines: RegressionLineData[] }>(CACHE_KEY_SCATTER)
    if (cached) {
      setScatterData({ points: cached.points || [], regression_lines: cached.regression_lines || [] })
      return
    }
    fetchAnalysisScatter('spring', 2000)
      .then((data) => {
        setScatterData({ points: data.points || [], regression_lines: data.regression_lines || [] })
        setCache(CACHE_KEY_SCATTER, data)
      })
      .catch(() => {
        // Non-critical: scatter chart is optional enhancement
      })
  }, [])

  // Fetch residual data when active model changes
  useEffect(() => {
    fetchAnalysisResiduals(activeModel, 'spring', 2000)
      .then((data) => {
        setResidualData(data)
      })
      .catch(() => {
        // Non-critical
      })
  }, [activeModel])

  // Local R2 points → MapPoint for GVIMap heatmap, filtered by activeModel
  const localR2MapPoints: MapPoint[] = useMemo(() => {
    const filtered = localR2Points.filter(
      (p) => !p.model_type || p.model_type === activeModel
    )
    return filtered.map((p, i) => ({
      id: i,
      point_id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.local_r2, // reuse gvi field for local_r2 value (drives color)
      ndvi: null,
      road_type: null,
    }))
  }, [localR2Points, activeModel])

  // Local R² statistics for active model
  const localR2Stats = useMemo(() => {
    const filtered = localR2Points.filter(
      (p) => !p.model_type || p.model_type === activeModel
    )
    if (filtered.length === 0) return null
    const r2Vals = filtered.map((p) => p.local_r2)
    const mean = r2Vals.reduce((a, b) => a + b, 0) / r2Vals.length
    const maxR2 = Math.max(...r2Vals)
    const minR2 = Math.min(...r2Vals)
    const above06 = r2Vals.filter((v) => v >= 0.6).length
    const below03 = r2Vals.filter((v) => v < 0.3).length
    return {
      mean: mean.toFixed(3),
      max: maxR2.toFixed(3),
      min: minR2.toFixed(3),
      count: filtered.length,
      above06Pct: ((above06 / filtered.length) * 100).toFixed(1),
      below03Pct: ((below03 / filtered.length) * 100).toFixed(1),
    }
  }, [localR2Points, activeModel])

  // Compute coefficient domains for bar visualization
  const ndviDomain = useMemo((): [number, number] => {
    const vals = models.map((m) => parseCoef(m.ndvi_coef)).filter(Boolean).flatMap((p) => [p!.min, p!.max])
    if (vals.length === 0) return [-2, 2]
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.1 || 0.5
    return [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]
  }, [models])

  const interceptDomain = useMemo((): [number, number] => {
    const vals = models.map((m) => parseCoef(m.intercept)).filter(Boolean).flatMap((p) => [p!.min, p!.max])
    if (vals.length === 0) return [-10, 10]
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.1 || 0.5
    return [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]
  }, [models])

  // Best model recommendation
  const bestModel = useMemo(() => {
    if (models.length === 0) return null
    return models.reduce((best, m) => (m.r2 > best.r2 ? m : best), models[0])
  }, [models])

  // NDVI-GVI scatter + regression lines
  const scatterOption: EChartsOption = useMemo(() => {
    if (scatterData.points.length === 0) return {}
    const ndviMin = Math.min(...scatterData.points.map((p) => p.ndvi))
    const ndviMax = Math.max(...scatterData.points.map((p) => p.ndvi))
    const xPad = (ndviMax - ndviMin) * 0.05 || 0.1
    const xMin = ndviMin - xPad
    const xMax = ndviMax + xPad

    return {
      title: { text: 'NDVI-GVI 散点图与回归线', left: 'center' },
      tooltip: {
        trigger: 'item',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (params.seriesName && params.seriesName !== '采样点') {
            const line = scatterData.regression_lines.find((l) => MODEL_LABELS[l.model_type] === params.seriesName)
            if (line) return `${params.seriesName}<br/>y = ${line.slope.toFixed(3)}x + ${line.intercept.toFixed(3)}<br/>R² = ${line.r2.toFixed(3)}`
          }
          const v = Array.isArray(params.value) ? params.value : (Array.isArray(params.data) ? params.data : null)
          if (v && v.length >= 2) return `NDVI: ${Number(v[0]).toFixed(3)}<br/>GVI: ${Number(v[1]).toFixed(1)}`
          return ''
        },
      },
      toolbox: {
        feature: { saveAsImage: { title: '导出' } },
        right: 10,
        top: 0,
      },
      legend: {
        data: [
          '采样点',
          ...scatterData.regression_lines.map((l) => MODEL_LABELS[l.model_type] || l.model_type),
        ],
        bottom: 0,
      },
      grid: { left: 60, right: 30, top: 50, bottom: 60 },
      xAxis: {
        type: 'value',
        name: 'NDVI',
        min: xMin,
        max: xMax,
      },
      yAxis: {
        type: 'value',
        name: 'GVI (%)',
      },
      series: [
        {
          name: '采样点',
          type: 'scatter',
          data: scatterData.points.map((p) => [p.ndvi, p.gvi]),
          symbolSize: 3,
          itemStyle: { color: 'rgba(100,116,139,0.3)' },
          large: true,
          largeThreshold: 1000,
        },
        ...scatterData.regression_lines.map((line) => ({
          name: MODEL_LABELS[line.model_type] || line.model_type,
          type: 'line' as const,
          data: [
            [xMin, line.slope * xMin + line.intercept],
            [xMax, line.slope * xMax + line.intercept],
          ],
          lineStyle: { width: 2, color: line.color },
          itemStyle: { color: line.color },
          symbol: 'none' as const,
          tooltip: { trigger: 'item' as const },
        })),
      ],
    }
  }, [scatterData])

  // Residual analysis charts
  const residualScatterOption: EChartsOption = useMemo(() => {
    if (!residualData || residualData.predicted_vs_actual.length === 0) return {}
    const pva = residualData.predicted_vs_actual
    const allVals = [...pva.map((p) => p.predicted), ...pva.map((p) => p.actual)]
    const minVal = Math.min(...allVals)
    const maxVal = Math.max(...allVals)

    return {
      title: { text: `残差分析 — ${MODEL_LABELS[activeModel]}`, left: 'center' },
      tooltip: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const v = Array.isArray(params.value) ? params.value : (Array.isArray(params.data) ? params.data : null)
          if (v && v.length >= 3) {
            return `预测: ${Number(v[0]).toFixed(1)}%<br/>实际: ${Number(v[1]).toFixed(1)}%<br/>残差: ${Number(v[2]).toFixed(1)}`
          }
          return ''
        },
      },
      toolbox: { feature: { saveAsImage: { title: '导出' } }, right: 10, top: 0 },
      grid: { left: 60, right: 30, top: 50, bottom: 50 },
      xAxis: { type: 'value', name: '预测 GVI (%)', min: minVal, max: maxVal },
      yAxis: { type: 'value', name: '实际 GVI (%)', min: minVal, max: maxVal },
      series: [
        {
          name: '采样点',
          type: 'scatter',
          data: pva.map((p) => [p.predicted, p.actual, p.residual]),
          symbolSize: 5,
          itemStyle: {
            // Color by residual: green (near 0) → red (large)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            color: (params: any) => {
              const resid = Math.abs(params.value?.[2] ?? 0)
              const maxResid = 20
              const t = Math.min(resid / maxResid, 1)
              const r = Math.round(34 + t * 205)
              const g = Math.round(197 - t * 157)
              const b = Math.round(94 - t * 54)
              return `rgb(${r},${g},${b})`
            },
            opacity: 0.6,
          },
          large: true,
          largeThreshold: 1000,
        },
        {
          name: 'y = x',
          type: 'line',
          data: [[minVal, minVal], [maxVal, maxVal]],
          lineStyle: { width: 2, type: 'dashed', color: '#999' },
          symbol: 'none',
          tooltip: { show: false },
        },
      ],
    }
  }, [residualData, activeModel])

  const residualHistOption: EChartsOption = useMemo(() => {
    if (!residualData || residualData.predicted_vs_actual.length === 0) return {}
    const residuals = residualData.predicted_vs_actual.map((p) => p.residual)
    const minR = Math.min(...residuals)
    const maxR = Math.max(...residuals)
    const binCount = 30
    const binWidth = (maxR - minR) / binCount || 1
    const bins = Array(binCount).fill(0)
    const binLabels: string[] = []
    for (let i = 0; i < binCount; i++) {
      const lo = minR + i * binWidth
      binLabels.push(lo.toFixed(1))
      for (const r of residuals) {
        if (r >= lo && r < lo + binWidth) bins[i]++
      }
    }
    // Catch last edge
    bins[binCount - 1] += residuals.filter((r) => r === maxR).length > 0 ? 1 : 0

    return {
      title: { text: '残差分布直方图', left: 'center' },
      tooltip: { trigger: 'axis', formatter: '{b}<br/>频次: {c}' },
      toolbox: { feature: { saveAsImage: { title: '导出' } }, right: 10, top: 0 },
      grid: { left: 60, right: 30, top: 50, bottom: 50 },
      xAxis: { type: 'category', data: binLabels, name: '残差', axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '频次' },
      series: [{
        type: 'bar',
        data: bins,
        itemStyle: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          color: (params: any) => {
            const centerIdx = binCount / 2
            const dist = Math.abs(params.dataIndex - centerIdx) / centerIdx
            const r = Math.round(34 + dist * 205)
            const g = Math.round(197 - dist * 157)
            const b = Math.round(94 - dist * 54)
            return `rgb(${r},${g},${b})`
          },
        },
      }],
    }
  }, [residualData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-28 bg-surface-200 dark:bg-surface-700 rounded" />
          <div className="h-4 w-56 bg-surface-100 dark:bg-surface-800 rounded mt-2" />
        </div>
        <div className="flex gap-1">
          {[1,2,3].map(i => <div key={i} className="h-9 w-20 bg-surface-100 dark:bg-surface-800 rounded-lg" />)}
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

  // 模型对比柱状图
  const modelLabels = models.map((m) => MODEL_LABELS[m.model_type] || m.model_type)

  const modelComparisonOption: EChartsOption = {
    title: { text: '模型性能对比', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['R²', 'RMSE'], bottom: 0 },
    toolbox: {
      feature: { saveAsImage: { title: '导出' } },
      right: 10,
      top: 0,
    },
    xAxis: {
      type: 'category',
      data: modelLabels,
    },
    yAxis: [
      { type: 'value', name: 'R²', max: 1 },
      { type: 'value', name: 'RMSE', position: 'right' },
    ],
    series: [
      {
        name: 'R²',
        type: 'bar',
        data: models.map((m) => m.r2),
        itemStyle: { color: '#22c55e' },
        barWidth: '30%',
      },
      {
        name: 'RMSE',
        type: 'bar',
        yAxisIndex: 1,
        data: models.map((m) => m.rmse),
        itemStyle: { color: '#3b82f6' },
        barWidth: '30%',
      },
    ],
  }

  // 雷达图 — 多维度模型对比
  const radarOption: EChartsOption = {
    title: { text: '多维度性能雷达图', left: 'center' },
    tooltip: {},
    toolbox: {
      feature: { saveAsImage: { title: '导出' } },
      right: 10,
      top: 0,
    },
    legend: {
      data: models.map((m) => MODEL_LABELS[m.model_type] || m.model_type),
      bottom: 0,
    },
    radar: {
      indicator: [
        { name: 'R²', max: 1 },
        { name: '调整R²', max: 1 },
        { name: 'RMSE(逆)', max: 1 },
        { name: 'AICc(逆)', max: 1 },
      ],
      shape: 'polygon',
      splitNumber: 5,
    },
    series: [
      {
        type: 'radar',
        data: models.map((m) => ({
          value: [
            m.r2,
            m.adj_r2,
            1 - Math.min(m.rmse / 30, 1), // normalize: lower RMSE → higher score
            1 - Math.min(m.aicc / 10000, 1), // normalize: lower AICc → higher score
          ],
          name: MODEL_LABELS[m.model_type] || m.model_type,
        })),
      },
    ],
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">空间分析</h2>
          <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
            对比不同空间回归模型的拟合效果，探索局部拟合度的空间分布特征
          </p>
        </div>
      </div>

      {/* Model Selector */}
      <div className="flex gap-1">
        {(['lr', 'gwr', 'mgwr'] as const).map((model) => (
          <button
            key={model}
            onClick={() => setActiveModel(model)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeModel === model
                ? 'bg-primary-600 text-white shadow-soft'
                : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
            }`}
          >
            {MODEL_LABELS[model]}
          </button>
        ))}
      </div>

      {/* Best Model Recommendation */}
      {bestModel && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-gradient-to-r from-primary-50 to-success-50 dark:from-primary-900/20 dark:to-success-900/20 border-primary-200 dark:border-primary-800"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="font-semibold text-primary-800 dark:text-primary-300">
                推荐模型：{MODEL_LABELS[bestModel.model_type]}
              </p>
              <p className="text-sm text-primary-600 dark:text-primary-400">
                R² = {bestModel.r2.toFixed(3)}，AICc = {bestModel.aicc.toFixed(1)}
                {bestModel.model_type === 'mgwr'
                  ? ' — 多尺度建模更精确地捕捉空间异质性'
                  : bestModel.model_type === 'gwr'
                  ? ' — 地理加权回归考虑了空间非平稳性'
                  : ' — 线性回归提供全局基准参考'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Model Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <GVIChart option={modelComparisonOption} className="h-80" />
        </div>
        <div className="card">
          <GVIChart option={radarOption} className="h-80" />
        </div>
      </div>

      {/* NDVI-GVI Scatter Chart */}
      {scatterData.points.length > 0 && (
        <div className="card">
          <GVIChart option={scatterOption} className="h-96" />
          <p className="text-xs text-gray-400 mt-2">
            散点展示 {scatterData.points.length.toLocaleString()} 个采样点的 NDVI-GVI 关系，三条回归线分别为 LR（蓝）、GWR（绿）、MGWR（橙）
          </p>
        </div>
      )}

      {/* Residual Analysis Section */}
      {residualData && residualData.predicted_vs_actual.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-50">残差诊断 — {MODEL_LABELS[activeModel]}</h3>
            <div className="flex items-center gap-4 text-xs text-surface-400 dark:text-surface-500">
              <span>均值残差: {residualData.summary.mean_residual}</span>
              <span>标准差: {residualData.summary.std_residual}</span>
              <span>范围: [{residualData.summary.min_residual}, {residualData.summary.max_residual}]</span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <GVIChart option={residualScatterOption} className="h-80" />
              <p className="text-xs text-gray-400 mt-2">
                X轴为模型预测GVI，Y轴为实际GVI。虚线为 y=x 完美拟合线，点颜色反映残差大小（绿=小、红=大）
              </p>
            </div>
            <div className="card">
              <GVIChart option={residualHistOption} className="h-80" />
              <p className="text-xs text-gray-400 mt-2">
                残差分布直方图，理想模型残差应接近正态分布且以0为中心
              </p>
            </div>
          </div>
          {/* Residual spatial map */}
          {residualData.residual_map.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-50">残差空间分布</h3>
                <span className="text-xs text-surface-400 dark:text-surface-500">
                  {residualData.residual_map.length.toLocaleString()} 个采样点 · 绿(低估) → 红(高估)
                </span>
              </div>
              <GVIMap
                points={residualData.residual_map.map((p, i) => ({
                  id: i,
                  point_id: i,
                  lat: p.lat,
                  lng: p.lng,
                  gvi: p.residual,
                  ndvi: null,
                  road_type: null,
                }))}
                season="spring"
                displayMode="heatmap"
                preferCanvas={false}
                valueRange={[-20, 20]}
                colorScheme="diverging"
                className="h-[400px] rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-2">
                空间分布展示残差的地理模式。若残差呈现空间聚集，说明模型存在遗漏变量或空间非平稳性，GWR/MGWR可进一步改善
              </p>
            </div>
          )}
        </div>
      )}

      {/* Local R² Statistics Cards */}
      {localR2Stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card" style={{ borderColor: 'var(--color-primary-200, #bbf7d0)' }}>
            <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">局部 R² 均值</p>
            <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">{localR2Stats.mean}</p>
            <p className="text-xs text-surface-400 mt-1">{localR2Stats.count.toLocaleString()} 个采样点</p>
          </div>
          <div className="stat-card" style={{ borderColor: 'var(--color-accent-200, #a5f3fc)' }}>
            <p className="text-xs text-accent-600 dark:text-accent-400 mb-1">最高 R² 区域</p>
            <p className="text-2xl font-bold text-accent-700 dark:text-accent-300">{localR2Stats.max}</p>
            <p className="text-xs text-surface-400 mt-1">模型拟合最佳位置</p>
          </div>
          <div className="stat-card" style={{ borderColor: 'var(--color-danger-200, #fecaca)' }}>
            <p className="text-xs text-danger-600 dark:text-danger-400 mb-1">最低 R² 区域</p>
            <p className="text-2xl font-bold text-danger-700 dark:text-danger-300">{localR2Stats.min}</p>
            <p className="text-xs text-surface-400 mt-1">模型拟合较弱位置</p>
          </div>
          <div className="stat-card" style={{ borderColor: 'var(--color-info-200, #bfdbfe)' }}>
            <p className="text-xs text-info-600 dark:text-info-400 mb-1">拟合优良占比</p>
            <p className="text-2xl font-bold text-info-700 dark:text-info-300">{localR2Stats.above06Pct}%</p>
            <p className="text-xs text-surface-400 mt-1">R² &ge; 0.6 的比例（弱拟合 {localR2Stats.below03Pct}%）</p>
          </div>
        </div>
      )}

      {/* Local R2 Map — heatmap on real map */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            局部模型拟合度 (Local R²) 空间分布 — {MODEL_LABELS[activeModel]}
          </h3>
          <span className="text-xs text-surface-400 dark:text-surface-500">
            {localR2MapPoints.length.toLocaleString()} 个采样点 · 绿(R²高) → 红(R²低)
          </span>
        </div>
        <GVIMap
          points={localR2MapPoints}
          season="spring"
          displayMode="heatmap"
          preferCanvas={false}
          valueRange={[0, 1]}
          colorScheme="r2"
          className="h-[500px] w-full rounded-lg z-0"
        />
        <p className="text-xs text-gray-400 mt-2">
          颜色越绿表示模型在该区域的拟合度越高，颜色越红表示拟合度越低。
          {activeModel === 'lr' && '线性回归为全局模型，局部R²反映各点残差与NDVI偏差的综合评估。'}
          {activeModel !== 'lr' && 'GWR/MGWR的局部R²基于NDVI方差加权估算，精确值需独立运算。'}
        </p>
      </div>

      {/* Coefficient Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-4">模型系数对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-surface-50 dark:bg-surface-800/50">
                <th className="text-left py-3 px-4">模型</th>
                <th className="text-right py-3 px-4">R²</th>
                <th className="text-right py-3 px-4">调整R²</th>
                <th className="text-right py-3 px-4">RMSE</th>
                <th className="text-right py-3 px-4">AICc</th>
                <th className="text-right py-3 px-4">NDVI系数</th>
                <th className="text-right py-3 px-4">截距</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const isBest = bestModel?.model_type === m.model_type
                return (
                  <tr
                    key={m.model_type}
                    className={`border-b ${isBest ? 'bg-primary-50' : ''}`}
                  >
                    <td className={`py-3 px-4 font-medium ${isBest ? 'text-primary-700 dark:text-primary-400' : 'text-surface-900 dark:text-surface-100'}`}>
                      {isBest && '🏆 '}{MODEL_LABELS[m.model_type] || m.model_type}
                      {m.is_estimated && <span className="ml-1 text-xs bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300 px-1.5 py-0.5 rounded">估算</span>}
                    </td>
                    <td className={`text-right py-3 px-4 ${isBest ? 'font-bold' : ''}`}>
                      {m.r2.toFixed(3)}
                    </td>
                    <td className="text-right py-3 px-4">{m.adj_r2.toFixed(3)}</td>
                    <td className="text-right py-3 px-4">{m.rmse.toFixed(2)}</td>
                    <td className="text-right py-3 px-4">{m.aicc.toFixed(1)}</td>
                    <td className="py-3 px-4">
                      <CoefBar value={m.ndvi_coef} color="#22c55e" domain={ndviDomain} />
                    </td>
                    <td className="py-3 px-4">
                      <CoefBar value={m.intercept} color="#3b82f6" domain={interceptDomain} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          * GWR/MGWR 结果基于 LR 估计值推算，如需精确结果请导入模型运算数据
        </p>
      </div>
    </div>
  )
}
