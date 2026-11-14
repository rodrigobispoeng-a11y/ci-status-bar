export type CiSnapshot = {
  repoDir: string
  branch: string
  pr: { number: number; title: string; url: string; state: string; isDraft: boolean } | null
  passed: number
  failed: number
  pending: number
  failedNames: string[]
  checkedAt: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'ci-status-bar': { snapshot: CiSnapshot | null; isHidden: boolean }
  }
}
