import type { LLMConfig } from '../../utils/api'
import { PROVIDER_OPTIONS, DEFAULT_MODELS } from './types'

interface LLMConfigPanelProps {
  config: LLMConfig
  onChange: (config: LLMConfig) => void
}

export default function LLMConfigPanel({ config, onChange }: LLMConfigPanelProps) {
  return (
    <div className="card bg-blue-50 border-blue-200">
      <h3 className="font-semibold mb-3">LLM 配置</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">提供商</label>
          <select
            value={config.provider}
            onChange={(e) =>
              onChange({
                ...config,
                provider: e.target.value,
                model: DEFAULT_MODELS[e.target.value],
              })
            }
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            API Key{config.provider !== 'custom' ? ' (可选，后端已配置)' : ' (必填)'}
          </label>
          <input
            type="password"
            value={config.api_key || ''}
            onChange={(e) => onChange({ ...config, api_key: e.target.value || undefined })}
            placeholder={config.provider === 'custom' ? 'sk-...' : '留空使用服务端配置'}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">模型</label>
          <input
            type="text"
            value={config.model || ''}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            placeholder={DEFAULT_MODELS[config.provider]}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {config.provider === 'custom'
          ? 'Custom provider 需要提供 API Key 和 Base URL。'
          : '内置提供商的 API Key 由后端 .env 管理，无需前端传入。Custom provider 需手动填写。'}
      </p>
    </div>
  )
}
