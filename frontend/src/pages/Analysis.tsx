import { useState, useEffect } from 'react'
import GVIChart from '../components/GVIChart'
import type { EChartsOption } from 'echarts'
import { fetchAnalysisModels } from '../utils/api'

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

  // 局部 R² 散点图（采样显示）
  const sampledR2 = localR2Points.length > 2000
    ? localR2Points.filter((_, i) => i % Math.ceil(localR2Points.length / 2000) === 0)
    : localR2Points

  const localR2Option: EChartsOption = {
    title: { text: `${MODEL_LABELS[activeModel]} — 局部R²分布`, left: 'center' },
    tooltip: {
      formatter: (params: any) => {
        const d = params.data
        return `R²: ${d[2].toFixed(3)}<br/>经度: ${d[0].toFixed(4)}<br/>纬度: ${d[1].toFixed(4)}`
      },
    },
    visualMap: {
      min: 0,
      max: 1,
      calculable: true,
      inRange: { color: ['#fee2e2', '#fbbf24', '#22c55e'] },
    },
    xAxis: { type: 'value', min: 118.5, max: 119.1, name: '经度' },
    yAxis: { type: 'value', min: 31.8, max: 32.2, name: '纬度' },
    series: [
      {
        type: 'scatter',
        data: sampledR2.map((p) => [p.lng, p.lat, p.local_r2]),
        symbolSize: 7,
        itemStyle: { opacity: 0.7 },
      },
    ],
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">空间分析</h2>

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

      {/* Model Comparison */}
      <div className="card">
        <GVIChart option={modelComparisonOption} className="h-80" />
      </div>

      {/* Local R2 Map */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">局部模型拟合度 (Local R²)</h3>
        <GVIChart option={localR2Option} className="h-96" />
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
                const isMGWR = m.model_type === 'mgwr'
                return (
                  <tr
                    key={m.model_type}
                    className={`border-b ${isMGWR ? 'bg-primary-50' : ''}`}
                  >
                    <td className={`py-3 px-4 font-medium ${isMGWR ? 'text-primary-700' : ''}`}>
                      {MODEL_LABELS[m.model_type] || m.model_type}
                    </td>
                    <td className={`text-right py-3 px-4 ${isMGWR ? 'font-bold' : ''}`}>
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
