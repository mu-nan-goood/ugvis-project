import { useState, useEffect, useMemo } from 'react'
import GVIChart from '../components/GVIChart'
import GVIMap from '../components/GVIMap'
import type { EChartsOption } from '../components/GVIChart'
import { fetchAnalysisModels } from '../utils/api'
import type { MapPoint } from '../types'

interface ModelMetrics {
  model_type: string
  r2: number
  adj_r2: number
  rmse: number
  aicc: number
  ndvi_coef: string
  intercept: string
}

interface LocalR2Point {
  lat: number
  lng: number
  local_r2: number
}

const MODEL_LABELS: Record<string, string> = {
  lr: '线性回归 (LR)',
  gwr: '地理加权回归 (GWR)',
  mgwr: '多尺度GWR (MGWR)',
}


export default function Analysis() {
  const [activeModel, setActiveModel] = useState<'lr' | 'gwr' | 'mgwr'>('mgwr')
  const [models, setModels] = useState<ModelMetrics[]>([])
  const [localR2Points, setLocalR2Points] = useState<LocalR2Point[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAnalysisModels()
      .then((data) => {
        setModels(data.models || [])
        setLocalR2Points(data.local_r2_points || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Local R2 points → MapPoint for GVIMap heatmap
  const localR2MapPoints: MapPoint[] = useMemo(() => {
    return localR2Points.map((p, i) => ({
      id: i,
      lat: p.lat,
      lng: p.lng,
      gvi: p.local_r2, // reuse gvi field for local_r2 value (drives color)
      ndvi: null,
      road_type: null,
    }))
  }, [localR2Points])

  // Best model recommendation
  const bestModel = useMemo(() => {
    if (models.length === 0) return null
    return models.reduce((best, m) => (m.r2 > best.r2 ? m : best), models[0])
  }, [models])

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
          <h2 className="text-2xl font-bold">空间分析</h2>
          <p className="text-sm text-gray-500 mt-1">
            对比不同空间回归模型的拟合效果，探索局部拟合度的空间分布特征
          </p>
        </div>
      </div>

      {/* Model Selector */}
      <div className="flex gap-2">
        {(['lr', 'gwr', 'mgwr'] as const).map((model) => (
          <button
            key={model}
            onClick={() => setActiveModel(model)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeModel === model
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {MODEL_LABELS[model]}
          </button>
        ))}
      </div>

      {/* Best Model Recommendation */}
      {bestModel && (
        <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="font-semibold text-green-800">
                推荐模型：{MODEL_LABELS[bestModel.model_type]}
              </p>
              <p className="text-sm text-green-600">
                R² = {bestModel.r2.toFixed(3)}，AICc = {bestModel.aicc.toFixed(1)}
                {bestModel.model_type === 'mgwr'
                  ? ' — 多尺度建模更精确地捕捉空间异质性'
                  : bestModel.model_type === 'gwr'
                  ? ' — 地理加权回归考虑了空间非平稳性'
                  : ' — 线性回归提供全局基准参考'}
              </p>
            </div>
          </div>
        </div>
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

      {/* Local R2 Map — heatmap on real map */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">
            局部模型拟合度 (Local R²) 空间分布 — {MODEL_LABELS[activeModel]}
          </h3>
          <span className="text-sm text-gray-500">
            {localR2MapPoints.length.toLocaleString()} 个采样点 · 绿(R²高) → 红(R²低)
          </span>
        </div>
        <GVIMap
          points={localR2MapPoints}
          season="spring"
          displayMode="heatmap"
          className="h-[500px] rounded-lg"
        />
        <p className="text-xs text-gray-400 mt-2">
          颜色越绿表示模型在该区域的拟合度越高，颜色越红表示拟合度越低。
          {activeModel === 'lr' && '线性回归为全局模型，局部R²反映各点残差与NDVI偏差的综合评估。'}
          {activeModel !== 'lr' && 'GWR/MGWR的局部R²基于NDVI方差加权估算，精确值需独立运算。'}
        </p>
      </div>

      {/* Coefficient Table */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">模型系数对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
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
                    <td className={`py-3 px-4 font-medium ${isBest ? 'text-primary-700' : ''}`}>
                      {isBest && '🏆 '}{MODEL_LABELS[m.model_type] || m.model_type}
                    </td>
                    <td className={`text-right py-3 px-4 ${isBest ? 'font-bold' : ''}`}>
                      {m.r2.toFixed(3)}
                    </td>
                    <td className="text-right py-3 px-4">{m.adj_r2.toFixed(3)}</td>
                    <td className="text-right py-3 px-4">{m.rmse.toFixed(2)}</td>
                    <td className="text-right py-3 px-4">{m.aicc.toFixed(1)}</td>
                    <td className="text-right py-3 px-4">{m.ndvi_coef}</td>
                    <td className="text-right py-3 px-4">{m.intercept}</td>
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
