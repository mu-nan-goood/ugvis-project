import { motion } from 'framer-motion'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      {icon && (
        <div className="mb-4 text-surface-300 dark:text-surface-600">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-surface-600 dark:text-surface-300">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-surface-400 dark:text-surface-500 mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary mt-4"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
