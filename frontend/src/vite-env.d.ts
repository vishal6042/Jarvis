/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Stamped in by vite.config.ts at build time — see the `define` block there. */
declare const __APP_VERSION__: string;
declare const __BUILT_AT__: string;
