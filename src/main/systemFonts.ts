import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

type GetFontsFn = (options?: { disableQuoting?: boolean }) => Promise<string[]>

let resolvedGetFonts: GetFontsFn | null = null

/**
 * 打包后主进程在 out/main/index.js，仅用 createRequire(import.meta.url) 时 Node 从 out/main 往上找
 * node_modules，在部分工作目录/启动方式下会找不到 font-list，invoke 返回空列表。
 * 依次尝试：应用根（package.json 所在）→ cwd → out/main 上两级（仓库根）。
 */
function getFontsFromModule(): GetFontsFn {
  if (resolvedGetFonts) return resolvedGetFonts
  const candidates: string[] = []
  try {
    candidates.push(join(app.getAppPath(), 'package.json'))
  } catch {
    /* app 未就绪时略过 */
  }
  candidates.push(join(process.cwd(), 'package.json'))
  const bundledMainDir = dirname(fileURLToPath(import.meta.url))
  candidates.push(join(bundledMainDir, '..', '..', 'package.json'))

  const seen = new Set<string>()
  let lastErr: unknown
  for (const pkgPath of candidates) {
    const norm = pkgPath.replace(/\\/g, '/')
    if (seen.has(norm)) continue
    seen.add(norm)
    try {
      if (!existsSync(pkgPath)) continue
      const req = createRequire(pkgPath)
      const mod = req('font-list') as { getFonts?: GetFontsFn }
      if (typeof mod?.getFonts === 'function') {
        resolvedGetFonts = mod.getFonts
        return resolvedGetFonts
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    `无法加载 font-list（已尝试应用目录与工程根 package.json）：${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  )
}

function windowsPowerShellExe(): string {
  const root = process.env.SystemRoot || process.env.windir
  if (root) {
    const p = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (existsSync(p)) return p
  }
  return 'powershell.exe'
}

/** 与 font-list 的 WPF 枚举一致；不经 cmd.exe，避免 Electron 主进程下 stdout 为空。 */
async function listWindowsFontsViaPowerShellExecFile(): Promise<string[]> {
  const ps = [
    'Add-Type -AssemblyName PresentationCore',
    '$families = [Windows.Media.Fonts]::SystemFontFamilies',
    'foreach ($family in $families) {',
    "  $name = ''",
    "  if (-not $family.FamilyNames.TryGetValue([Windows.Markup.XmlLanguage]::GetLanguage('zh-cn'), [ref]$name)) {",
    "    $name = $family.FamilyNames[[Windows.Markup.XmlLanguage]::GetLanguage('en-us')]",
    '  }',
    '  if ($name) {',
    '    $bytes = [System.Text.Encoding]::Unicode.GetBytes($name)',
    '    $b64 = [Convert]::ToBase64String($bytes)',
    '    Write-Output $b64',
    '  }',
    '}',
  ].join('\n')
  const encoded = Buffer.from(ps, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(windowsPowerShellExe(), [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encoded,
  ], {
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
    encoding: 'utf8',
  })
  return stdout
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter((f) => !!f)
    .map((b64) => {
      try {
        return Buffer.from(b64, 'base64').toString('utf16le').trim()
      } catch {
        return ''
      }
    })
    .filter((name) => !!name)
}

let cache: { fonts: string[]; at: number } | null = null
const CACHE_MS = 120_000

/** 枚举本机已安装字体族名（去重、排序）；带短缓存避免重复调用 PowerShell/VBS。 */
export async function getSystemFontFamilies(): Promise<string[]> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) return cache.fonts

  let raw: string[] = []
  if (process.platform === 'win32') {
    try {
      raw = await listWindowsFontsViaPowerShellExecFile()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[WorkBreak] PowerShell 字体枚举失败:', msg)
    }
    if (raw.length === 0) {
      try {
        const getFonts = getFontsFromModule()
        const alt = await getFonts({ disableQuoting: true })
        if (Array.isArray(alt) && alt.length > 0) raw = alt
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2)
        console.error('[WorkBreak] font-list 回退失败:', msg)
      }
    }
  } else {
    const getFonts = getFontsFromModule()
    const alt = await getFonts({ disableQuoting: true })
    raw = Array.isArray(alt) ? alt : []
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const f of raw) {
    const t = typeof f === 'string' ? f.trim() : String(f).trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  cache = { fonts: out, at: now }
  return out
}

export function clearSystemFontListCache(): void {
  cache = null
}
