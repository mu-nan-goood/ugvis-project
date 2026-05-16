import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, ScatterChart, BoxplotChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, ScatterSeriesOption, BoxplotSeriesOption } from 'echarts/charts'
import type {
  TitleComponentOption,
  TooltipComponentOption,
  GridComponentOption,
  VisualMapComponentOption,
  LegendComponentOption,
} from 'echarts/components'

// Combined option type for our usage — export for pages to use
export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | ScatterSeriesOption
  | BoxplotSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | VisualMapComponentOption
  | LegendComponentOption
>

// Register only the components we actually use
echarts.use([
  BarChart,
  ScatterChart,
  BoxplotChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
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
