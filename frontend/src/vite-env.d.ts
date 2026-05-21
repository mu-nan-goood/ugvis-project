/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY: string
  readonly VITE_BAIDU_AK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
