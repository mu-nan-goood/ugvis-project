import { motion } from 'framer-motion'

interface AnimatedCardProps {
  children: React.ReactNode
  className?: string
  delay?: number
  hover?: boolean
}

export default function AnimatedCard({ children, className = '', delay = 0, hover = true }: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={hover ? { y: -2, boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12)' } : undefined}
      className={`card ${className}`}
    >
      {children}
    </motion.div>
  )
}
