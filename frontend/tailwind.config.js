/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ─── Color System ─────────────────────────────────────────
      // 基于 Sustainability/ESG Platform 色板，适配城市绿视率主题
      colors: {
        // 品牌主色 — 自然绿（保留原有 primary 阶梯，微调饱和度）
        primary: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        // 辅助色 — 海洋蓝（用于图表第二色、辅助高亮）
        accent: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        // 语义色 — 状态反馈
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        info: {
          50:  '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // 中性色 — Slate 冷调系（替代默认 Gray，更专业）
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },

      // ─── Typography ────────────────────────────────────────────
      // Noto Sans SC (中文) + Inter (英文/数字) 组合
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans SC',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'monospace',
        ],
      },
      // 字号阶梯 — 语义化映射
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],  // 10px — caption/badge
        'xs':   ['0.75rem',  { lineHeight: '1rem' }],      // 12px — small label
        'sm':   ['0.875rem', { lineHeight: '1.25rem' }],   // 14px — body small
        'base': ['1rem',     { lineHeight: '1.5rem' }],    // 16px — body
        'lg':   ['1.125rem', { lineHeight: '1.75rem' }],   // 18px — subtitle
        'xl':   ['1.25rem',  { lineHeight: '1.75rem' }],   // 20px — heading 4
        '2xl':  ['1.5rem',   { lineHeight: '2rem' }],      // 24px — heading 3
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],   // 30px — heading 2
        '4xl':  ['2.25rem',  { lineHeight: '2.5rem' }],    // 36px — heading 1
      },

      // ─── Spacing & Layout ─────────────────────────────────────
      spacing: {
        '4.5': '1.125rem',
        '13':  '3.25rem',
        '15':  '3.75rem',
        '18':  '4.5rem',
        '22':  '5.5rem',
        '26':  '6.5rem',
        '30':  '7.5rem',
      },

      // ─── Border Radius ────────────────────────────────────────
      borderRadius: {
        'sm':   '0.25rem',   // 4px — small elements
        'md':   '0.375rem',  // 6px — buttons, inputs
        'lg':   '0.5rem',    // 8px — cards
        'xl':   '0.75rem',   // 12px — panels
        '2xl':  '1rem',      // 16px — modals
        '3xl':  '1.5rem',    // 24px — hero sections
      },

      // ─── Shadows ──────────────────────────────────────────────
      boxShadow: {
        'xs':    '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'soft':  '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card':  '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'float': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'lift':  '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
        'modal': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.06)',
      },

      // ─── Animation ────────────────────────────────────────────
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },

      // ─── Transition ───────────────────────────────────────────
      transitionTimingFunction: {
        'out': 'cubic-bezier(0.0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
