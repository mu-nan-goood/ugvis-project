import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, ScatterChart, BoxplotChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
  ToolboxComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, ScatterSeriesOption, BoxplotSeriesOption, LineSeriesOption, PieSeriesOption, RadarSeriesOption } from 'echarts/charts'
import type {
  TitleComponentOption,
  TooltipComponentOption,
  GridComponentOption,
  VisualMapComponentOption,
  LegendComponentOption,
  ToolboxComponentOption,
} from 'echarts/components'

// Combined option type for our usage — export for pages to use
export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | ScatterSeriesOption
  | BoxplotSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | RadarSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | VisualMapComponentOption
  | LegendComponentOption
  | ToolboxComponentOption
>

// Register only the components we actually use
echarts.use([
  BarChart,
  ScatterChart,
  BoxplotChart,
  LineChart,
  PieChart,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
  ToolboxComponent,
  CanvasRenderer,
])

interface GVIChartProps {
  option: EChartsOption
  className?: string
}

export default function GVIChart({ option, className = '' }: GVIChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)

  // 初始化：仅在组件挂载时执行一次
  useEffect(() => {
    if (!chartRef.current) return

    chartInstance.current = echarts.init(chartRef.current)

    const handleResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, []) // 空依赖 = 仅挂载时执行

  // 更新：option 变化时用 setOption 更新（不销毁实例）
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.setOption(option, { notMerge: true })
    }
  }, [option])

  return <div ref={chartRef} className={`w-full ${className}`} />
}
