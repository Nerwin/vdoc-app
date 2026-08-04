/// <reference types="vite/client" />

import type { VdocApi } from '../../shared/types.ts'

declare global {
  interface Window {
    vdoc: VdocApi
  }
}

export {}
