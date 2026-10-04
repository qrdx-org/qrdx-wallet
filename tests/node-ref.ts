/**
 * Locate the reference QRDX node checkout and its Python, for tests that ask
 * the node itself for an answer (liboqs signatures, generated addresses).
 *
 * Search order: $QRDX_NODE_DIR, ../qrdx-node (the mono-repo layout),
 * ref/qrdx-chain (the old standalone layout). Python: $QRDX_NODE_PYTHON, then
 * <node>/.venv/bin/python. Tests that need it skip when it is absent.
 */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const candidates = [process.env.QRDX_NODE_DIR, '../qrdx-node', 'ref/qrdx-chain']
  .filter((d): d is string => !!d)
  .map((d) => resolve(process.cwd(), d))

export const NODE_DIR = candidates.find((d) => existsSync(resolve(d, 'qrdx/constants.py'))) ?? null

export const NODE_PYTHON = (() => {
  const py =
    process.env.QRDX_NODE_PYTHON ?? (NODE_DIR ? resolve(NODE_DIR, '.venv/bin/python') : null)
  return py && existsSync(py) ? py : null
})()

/** True when the node's Python can import the given modules. */
export function nodePythonHas(...modules: string[]): boolean {
  if (!NODE_PYTHON || !NODE_DIR) return false
  try {
    execFileSync(NODE_PYTHON, ['-c', modules.map((m) => `import ${m}`).join(';')], {
      stdio: 'ignore',
      timeout: 30_000,
      cwd: NODE_DIR,
    })
    return true
  } catch {
    return false
  }
}

/** Run a Python snippet with the node on sys.path; returns the last stdout line (liboqs prints a banner). */
export function runNodePython(code: string): string {
  if (!NODE_PYTHON || !NODE_DIR) throw new Error('Reference node Python is not available')
  return execFileSync(
    NODE_PYTHON,
    ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(NODE_DIR)}); ${code}`],
    {
      encoding: 'utf8',
      cwd: NODE_DIR,
    }
  )
    .trim()
    .split('\n')
    .pop()!
    .trim()
}
