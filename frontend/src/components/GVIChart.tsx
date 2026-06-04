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

    const el = chartRef.current

    // 防御：容器尺寸为0时延迟初始化（常见于 Tab/懒加载/动画场景）
    const initChart = () => {
      if (!el || chartInstance.current) return
      const { offsetWidth, offsetHeight } = el
      if (offsetWidth === 0 || offsetHeight === 0) {
        // 容器尚未布局，用 rAF 等一帧后重试
        requestAnimationFrame(initChart)
        return
      }
      chartInstance.current = echarts.init(el)
      // 初始化后立即应用当前 option（如果 option effect 已执行过）
      // 通过 dispatchEvent 通知 option effect
      el.dispatchEvent(new CustomEvent('chart-ready'))
    }
    initChart()

    // 用 ResizeObserver 监听容器自身尺寸变化（侧边栏折叠、grid 重排等）
    // 同时也作为容器从 0 → 有尺寸时的初始化触发
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      // 如果实例还没初始化，先尝试初始化
      if (!chartInstance.current && el.offsetWidth > 0 && el.offsetHeight > 0) {
        chartInstance.current = echarts.init(el)
        el.dispatchEvent(new CustomEvent('chart-ready'))
      }
      if (resizeTimer) clearTimeout(resizeTimer)
      chartInstance.current?.resize()
      resizeTimer = setTimeout(() => chartInstance.current?.resize(), 80)
    }
    const observer = new ResizeObserver(handleResize)
    observer.observe(el)

    // 保留 window.resize 兜底
    const handleWindowResize = () => chartInstance.current?.resize()
    window.addEventListener('resize', handleWindowResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [])

  // option ref 用于 chart-ready 事件回调中读取最新 option
  const optionRef = useRef(option)
  optionRef.current = option

  // 更新：option 变化时用 setOption 更新（不销毁实例）
  useEffect(() => {
    const el = chartRef.current
    if (!el) return

    const applyOption = () => {
      if (chartInstance.current) {
        chartInstance.current.setOption(optionRef.current, { notMerge: true })
      }
    }

    // 监听 chart-ready 事件（初始化完成时立即应用 option）
    el.addEventListener('chart-ready', applyOption)

    // 立即尝试应用（实例可能已存在）
    if (chartInstance.current) {
      chartInstance.current.setOption(option, { notMerge: true })
    }

    return () => {
      el.removeEventListener('chart-ready', applyOption)
    }
  }, [option])

  return <div ref={chartRef} className={`w-full ${className}`} />
}
