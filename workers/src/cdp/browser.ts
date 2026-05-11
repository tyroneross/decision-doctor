/**
 * Chrome browser process lifecycle management.
 * Forked from Spectra — adapted for IBR engine.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME_PATHS = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  // Windows (WSL)
  '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
]

export function findChrome(): string | null {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

export type BrowserMode = 'local' | 'connect'

export interface BrowserConnectionOptions {
  mode?: BrowserMode
  cdpUrl?: string
  wsEndpoint?: string
  chromePath?: string
}

interface ResolvedBrowserConnectionOptions {
  mode: BrowserMode
  cdpUrl?: string
  wsEndpoint?: string
  chromePath?: string
}

export interface BrowserOptions extends BrowserConnectionOptions {
  headless?: boolean    // default: true
  port?: number         // default: random ephemeral port
  userDataDir?: string  // default: ~/.ibr/chromium-profile/
  /**
   * Rendering normalization for mockup comparison.
   * Adds --disable-lcd-text and --force-device-scale-factor=1.
   * These improve pixel-level consistency but reduce text rendering quality.
   * Default: false
   */
  normalize?: boolean
}

function randomPort(): number {
  return 49152 + Math.floor(Math.random() * (65535 - 49152))
}

async function findFreePort(maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = randomPort()
    const isFree = await checkPortFree(port)
    if (isFree) return port
  }
  // Last resort: let OS assign
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const port = (srv.address() as any).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, () => srv.close(() => resolve(true)))
  })
}

async function resolveWsEndpoint(cdpUrl: string): Promise<string> {
  const res = await fetch(`${cdpUrl}/json/version`)
  if (!res.ok) {
    throw new Error(`CDP endpoint did not respond: ${cdpUrl}`)
  }
  const data = await res.json() as { webSocketDebuggerUrl?: string }
  if (!data.webSocketDebuggerUrl) {
    throw new Error(`CDP endpoint did not return a WebSocket URL: ${cdpUrl}`)
  }
  return data.webSocketDebuggerUrl
}

export function resolveBrowserConnectionOptions(
  options: BrowserConnectionOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedBrowserConnectionOptions {
  const wsEndpoint = options.wsEndpoint || env.IBR_WS_ENDPOINT
  const cdpUrl = options.cdpUrl || env.IBR_CDP_URL
  const requestedMode = options.mode || env.IBR_BROWSER_MODE
  const mode: BrowserMode = requestedMode === 'local'
    ? 'local'
    : requestedMode === 'connect' || wsEndpoint || cdpUrl
      ? 'connect'
      : 'local'

  return {
    mode,
    cdpUrl,
    wsEndpoint,
    chromePath: options.chromePath || env.IBR_CHROME_PATH,
  }
}

export class BrowserManager {
  private process: ChildProcess | null = null
  private _port = 0
  private _mode: BrowserMode = 'local'
  private _cdpUrl: string | null = null
  private _wsEndpoint: string | null = null

  async launch(options: BrowserOptions = {}): Promise<string> {
    const connection = resolveBrowserConnectionOptions(options)
    this._mode = connection.mode

    if (connection.mode === 'connect') {
      this.process = null
      this._port = 0
      this._cdpUrl = connection.cdpUrl ?? null
      if (connection.wsEndpoint) {
        this._wsEndpoint = connection.wsEndpoint
        return connection.wsEndpoint
      }
      if (connection.cdpUrl) {
        const wsUrl = await resolveWsEndpoint(connection.cdpUrl)
        this._wsEndpoint = wsUrl
        return wsUrl
      }
      throw new Error(
        'Connect mode requires a CDP endpoint.\n'
        + 'Provide --cdp-url http://127.0.0.1:9222 or --ws-endpoint ws://...\n'
        + 'You can also set IBR_CDP_URL or IBR_WS_ENDPOINT.'
      )
    }

    const headless = options.headless ?? true
    this._port = options.port ?? await findFreePort()
    let userDataDir = options.userDataDir ?? join(homedir(), '.decision-doctor', 'chromium-profile')

    // Chrome creates `SingletonLock` as a SYMLINK whose target is `<hostname>-<pid>`.
    // After a crash, the symlink remains but its target host/pid is gone, so
    // `existsSync` (which follows symlinks) returns false even though the link
    // is present. Chrome itself sees the link, refuses to acquire the singleton,
    // and aborts immediately ("Failed to create a ProcessSingleton... Aborting").
    // We must detect the symlink itself via `lstat`, not `stat`.
    const lockPath = join(userDataDir, 'SingletonLock')
    const lockStat = lstatSync(lockPath, { throwIfNoEntry: false })
    if (lockStat) {
      // Profile is locked (or has a stale crash-leftover lock symlink).
      // Use a temp profile to avoid conflict.
      userDataDir = mkdtempSync(join(tmpdir(), 'ibr-chrome-'))
    }

    const chromePath = connection.chromePath ?? findChrome()
    if (!chromePath) {
      throw new Error(
        'Chrome not found. Install Google Chrome or pass chromePath option.\n'
        + `Checked: ${CHROME_PATHS.join(', ')}`
      )
    }

    await mkdir(userDataDir, { recursive: true })

    const isLinux = process.platform === 'linux'

    const args = [
      `--remote-debugging-port=${this._port}`,
      `--remote-debugging-address=127.0.0.1`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
    ]
    if (isLinux) {
      // Container/CI-safe flags. Chromium will not launch in a Docker/Railway
      // container without --no-sandbox; --disable-dev-shm-usage avoids the
      // 64 MB /dev/shm cap that produces "tab crash" on small instances.
      args.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      )
    }
    if (headless) {
      args.push('--headless=new')
    }
    if (options.normalize) {
      // Reduce rendering inconsistencies for mockup pixel comparison
      args.push('--disable-lcd-text')          // disable subpixel text rendering
      args.push('--force-device-scale-factor=1') // prevent HiDPI scaling differences
    }

    this.process = spawn(chromePath, args, { stdio: 'pipe' })

    // Capture stderr so a crashing Chrome shows its real reason. Without this
    // the only signal at the call site is "Chrome debugger did not respond" —
    // the actual cause (missing libs, --no-sandbox required, etc.) hides in
    // the discarded stderr stream.
    const stderrChunks: Buffer[] = []
    this.process.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
      // Bounded to ~64 KB so a chatty Chrome doesn't OOM the worker.
      while (stderrChunks.reduce((n, b) => n + b.length, 0) > 65_536) {
        stderrChunks.shift()
      }
    })
    this.process.stdout?.on('data', () => { /* drain to avoid backpressure */ })

    this.process.on('error', (err) => {
      console.error(`[cdp] Chrome process error: ${err.message}`)
    })
    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        const tail = Buffer.concat(stderrChunks).toString('utf8').slice(-4096)
        console.error(`[cdp] Chrome exited code=${code} signal=${signal}\n${tail}`)
      }
    })

    try {
      const wsUrl = await this.waitForDebugger()
      this._cdpUrl = `http://127.0.0.1:${this._port}`
      this._wsEndpoint = wsUrl
      return wsUrl
    } catch (e) {
      // Surface captured stderr so the upstream graceful-degrade path can
      // record a real reason in metadata.content_extract.degraded_reason.
      const tail = Buffer.concat(stderrChunks).toString('utf8').slice(-2048)
      if (tail.trim().length > 0) {
        console.error(`[cdp] Chrome stderr tail:\n${tail}`)
      }
      throw e
    }
  }

  private async waitForDebugger(): Promise<string> {
    // 15 s gives slow first-launch on Railway-class instances time to write
    // the singleton lock, register the debugger socket, and respond to the
    // first poll. Earlier 5 s window was the proximate cause of the first
    // production degrade — see content-extract degraded:true outcome.
    const maxAttempts = 150 // 15 seconds at 100 ms intervals
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this._port}/json/version`)
        const data = (await res.json()) as { webSocketDebuggerUrl: string }
        return data.webSocketDebuggerUrl
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    throw new Error(
      `Chrome debugger did not respond within 15s on port ${this._port}. `
      + 'Is another Chrome instance using this port?\n'
      + 'If you are running inside a sandbox, retry with connect mode:\n'
      + '  --browser-mode connect --cdp-url http://127.0.0.1:9222'
    )
  }

  async close(): Promise<void> {
    if (this._mode !== 'local' || !this.process) return

    const proc = this.process
    this.process = null

    // Wait for process to exit, with SIGKILL escalation
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        // Escalate to SIGKILL after 3 seconds
        try { proc.kill('SIGKILL') } catch { /* already dead */ }
        resolve()
      }, 3000)

      proc.once('close', () => {
        clearTimeout(killTimer)
        resolve()
      })

      proc.kill('SIGTERM')
    })
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed
  }

  get port(): number {
    return this._port
  }

  get pid(): number | null {
    return this.process?.pid ?? null
  }

  get mode(): BrowserMode {
    return this._mode
  }

  get cdpUrl(): string | null {
    return this._cdpUrl
  }

  get wsEndpoint(): string | null {
    return this._wsEndpoint
  }
}
