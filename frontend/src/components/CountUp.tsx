import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface CountUpProps {
  value: number
  decimals?: number
  duration?: number
  className?: string
}

export default function CountUp({ value, decimals = 0, duration = 0.8, className = '' }: CountUpProps) {
  const spring = useSpring(0, { duration: duration * 1000, bounce: 0 })
  const display = useTransform(spring, (v) => v.toFixed(decimals))
  const [displayText, setDisplayText] = useState(value.toFixed(decimals))
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      spring.set(value)
      isFirstRender.current = false
    } else {
      spring.set(value)
    }
  }, [value, spring])

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      setDisplayText(v)
    })
    return unsubscribe
  }, [display])

  return (
    <motion.span className={`tabular-nums ${className}`}>
      {displayText}
    </motion.span>
  )
}
