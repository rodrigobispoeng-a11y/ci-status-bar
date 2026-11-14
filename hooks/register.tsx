import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CiSnapshot } from '../types'

const snapshot = atom({ plugin: 'ci-status-bar', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'ci-status-bar', key: 'isHidden' } as const, false)

const POLL_MS = 30_000
const PASS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAIL = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'ERROR', 'STARTUP_FAILURE', 'STALE'])

type Check = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

export const classify = (c: Check): 'pass' | 'fail' | 'pending' => {
  if (c.__typename === 'StatusContext' || (c.state && !c.status)) {
    const s = (c.state ?? '').toUpperCase()
    return s === 'SUCCESS' ? 'pass' : s === 'FAILURE' || s === 'ERROR' ? 'fail' : 'pending'
  }
  if ((c.status ?? '').toUpperCase() !== 'COMPLETED') return 'pending'
  const k = (c.conclusion ?? '').toUpperCase()
  return PASS.has(k) ? 'pass' : FAIL.has(k) ? 'fail' : 'pending'
}

let isRefreshing = false

async function findRepo($: EngineInterface): Promise<string | undefined> {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd }).catch(() => undefined)
  if (top?.exitCode === 0) return top.stdout.trim()
  const entries = await $.fs.list(cwd).catch(() => [])
  for (const entry of entries) {
    if (entry.kind !== 'dir' || entry.name.startsWith('.')) continue
    const dir = `${cwd}/${entry.name}`
    if (await $.fs.exists(`${dir}/.git`)) return dir
  }
  return undefined
}

async function refresh($: EngineInterface): Promise<void> {
  if (isRefreshing) return
  isRefreshing = true
  try {
    const repoDir = await findRepo($)
    if (repoDir === undefined) {
      await update($, snapshot, () => null)
      $.ui.status(undefined)
      return
    }
    const br = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir })
    const branch = br.stdout.trim()
    const checkedAt = await $.clock.now()
    const view = await $.process.run(
      ['gh', 'pr', 'view', '--json', 'number,title,url,state,isDraft,statusCheckRollup'],
      { cwd: repoDir, timeoutMs: 20_000 },
    )
    let next: CiSnapshot
    if (view.exitCode !== 0) {
      const noPr = /no pull requests found/i.test(view.stderr)
      next = {
        repoDir, branch, pr: null, passed: 0, failed: 0, pending: 0, failedNames: [], checkedAt,
        error: noPr ? undefined : view.stderr.trim().split('\n')[0]?.slice(0, 120),
      }
    } else {
      const data = JSON.parse(view.stdout) as {
        number: number; title: string; url: string; state: string; isDraft: boolean
        statusCheckRollup?: Check[]
      }
      const checks = data.statusCheckRollup ?? []
      const kinds = checks.map(classify)
      next = {
        repoDir, branch,
        pr: { number: data.number, title: data.title, url: data.url, state: data.state, isDraft: data.isDraft },
        passed: kinds.filter(k => k === 'pass').length,
        failed: kinds.filter(k => k === 'fail').length,
        pending: kinds.filter(k => k === 'pending').length,
        failedNames: checks.filter((_, i) => kinds[i] === 'fail').map(c => c.name ?? c.context ?? '?'),
        checkedAt,
      }
    }
    const prev = await read($, snapshot)
    await update($, snapshot, () => next)
    $.ui.status(statusText(next))
    if (prev?.pr && next.pr && prev.pr.number === next.pr.number && prev.pending > 0 && next.pending === 0 && next.passed + next.failed > 0) {
      $.ui.toast(next.failed > 0 ? `CI do PR #${next.pr.number} terminou com ${next.failed} falha(s)` : `CI do PR #${next.pr.number} passou`)
    }
  } catch {
    // a falha de uma consulta não deve derrubar a barra; tenta de novo no próximo ciclo
  } finally {
    isRefreshing = false
  }
}

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    timer?.cancel()
    timer = $.clock.every(POLL_MS, () => refresh($))
    void refresh($)
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\b(git\s+(push|checkout|switch)|gh\s+pr)\b/.test(e.command)) void refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) return next(e)

    const { Box, Button, Text, Progress, Link } = $.ui.resolve(e)
    const total = snap.passed + snap.failed + snap.pending
    const done = snap.passed + snap.failed

    if (snap.pr === null) {
      return (
        <Box>
          <Text dimColor>
            {snap.error ? `CI: ${snap.error}` : `${snap.branch}: sem PR aberto`}{' '}
          </Text>
        </Box>
      )
    }

    const color = snap.failed > 0 ? 'red' : snap.pending > 0 ? 'yellow' : 'green'
    const prLabel = `PR #${snap.pr.number}${snap.pr.isDraft ? ' (rascunho)' : ''} ${prState(snap.pr.state)}`
    return (
      <Box flexDirection="column">
        <Box>
          <Link href={snap.pr.url}>{prLabel}</Link>
          <Text> · {snap.branch} · </Text>
          {total === 0 ? (
            <Text dimColor>nenhum check de CI</Text>
          ) : (
            <Text color={color}>
              ✓ {snap.passed}  ✗ {snap.failed}  ⏳ {snap.pending}
            </Text>
          )}
          <Text> </Text>
          <Button key="refresh" label="Atualizar" onPress={() => refresh($)} />
          <Button key="hide" label="Ocultar" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {total > 0 ? (
          <Progress
            label="Checks de CI concluídos"
            value={done}
            max={total}
            valueText={`${done} de ${total}`}
            color={color}
          />
        ) : null}
        {snap.failedNames.length > 0 ? (
          <Text color="red">Falhou: {snap.failedNames.slice(0, 4).join(', ')}{snap.failedNames.length > 4 ? '…' : ''}</Text>
        ) : null}
      </Box>
    )
  })
}

const prState = (s: string) =>
  s === 'OPEN' ? 'aberto' : s === 'MERGED' ? 'mergeado' : s === 'CLOSED' ? 'fechado' : s.toLowerCase()

const statusText = (s: CiSnapshot) => {
  if (s.pr === null) return undefined
  const total = s.passed + s.failed + s.pending
  if (total === 0) return `PR #${s.pr.number}: sem checks`
  const icon = s.failed > 0 ? '✗' : s.pending > 0 ? '⏳' : '✓'
  return `PR #${s.pr.number} CI ${icon} ${s.passed + s.failed}/${total}`
}
