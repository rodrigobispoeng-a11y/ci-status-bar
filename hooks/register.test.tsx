import { expect, test } from 'claude-code/testing'

import type { CiSnapshot } from '../types'

const BAND = {
  plugin: 'ci-status-bar',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

const SNAP: CiSnapshot = {
  repoDir: '/repo', branch: 'feat/x',
  pr: { number: 12, title: 'X', url: 'https://github.com/o/r/pull/12', state: 'OPEN', isDraft: false },
  passed: 3, failed: 1, pending: 2, failedNames: ['lint'], checkedAt: 0,
}

test('a barra mostra o PR e o progresso dos checks', async ($, on) => {
  on('state.get', (_, e) => ({
    value: e.key === 'snapshot' ? { value: SNAP, version: 1 } : { value: false, version: 1 },
  }))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as any)
    expect((await ui.find({ type: 'Text', text: /✓ 3/ }))?.text).toContain('✗ 1')
    expect((await ui.find({ type: 'Text', text: /Falhou/ }))?.text).toContain('lint')
    await ui.unmount()
  }
})

test('sem PR, a barra diz o branch', async ($, on) => {
  on('state.get', (_, e) => ({
    value: e.key === 'snapshot'
      ? { value: { ...SNAP, pr: null, passed: 0, failed: 0, pending: 0, failedNames: [] }, version: 1 }
      : { value: false, version: 1 },
  }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
  expect((await ui.find({ type: 'Text', text: /sem PR/ }))?.text).toContain('feat/x')
  await ui.unmount()
})
