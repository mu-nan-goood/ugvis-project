import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface GVIChartProps {
  option: echarts.EChartsOption
  className?: string
}

export default function GVIChart({ option, className = '' }: GVIChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (chartRef.current) {
      chartInstance.current = echarts.init(chartRef.current)
      chartInstance.current.setOption(option)

      const handleResize = () => chartInstance.current?.resize()
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        chartInstance.current?.dispose()
      }
    }
  }, [option])

  return <div ref={chartRef} className={`w-full ${className}`} />
}
