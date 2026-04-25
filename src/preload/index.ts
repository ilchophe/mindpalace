import { contextBridge } from 'electron'

// Stub window.api surface — filled in Phase 1-5 as each domain is implemented.
// Shape mirrors the IPC contract in Plan.md §5.
const api = {
  // auth domain (Phase 3)
  auth: {},
  // vault domain (Phase 1)
  vault: {},
  // notes domain (Phase 1)
  notes: {},
  // search domain (Phase 4)
  search: {},
  // git domain (Phase 3)
  git: {},
  // images domain (Phase 5)
  images: {}
}

contextBridge.exposeInMainWorld('api', api)
