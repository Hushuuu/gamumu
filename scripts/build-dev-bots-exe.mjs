import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [apiUrlArg, ...extraArgs] = process.argv.slice(2)

if (!apiUrlArg || extraArgs.length > 0) {
  console.error('用法：npm run build:dev-bots:exe -- <API_URL>')
  process.exit(1)
}

let apiUrl
try {
  const parsedUrl = new URL(apiUrlArg.trim())
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('API_URL 必須是沒有帳密、路徑、query 或 hash 的 HTTP(S) origin。')
  }
  apiUrl = parsedUrl.origin
} catch (error) {
  console.error(error.message || 'API_URL 必須是有效的 HTTP(S) origin。')
  process.exit(1)
}

const sourcePath = join(projectRoot, 'scripts', 'dev-bots.mjs')
const source = await readFile(sourcePath, 'utf8')
const apiUrlPlaceholder = "const PACKAGED_API_URL = ''"
if (!source.includes(apiUrlPlaceholder)) {
  throw new Error('找不到 dev-bots.mjs 中的 API_URL 打包位置。')
}

const outputDirectory = join(projectRoot, 'dist')
await mkdir(outputDirectory, { recursive: true })
const temporaryDirectory = await mkdtemp(join(outputDirectory, '.dev-bots-build-'))

try {
  const entryPath = join(temporaryDirectory, 'dev-bots.mjs')
  await writeFile(
    entryPath,
    source.replace(apiUrlPlaceholder, `const PACKAGED_API_URL = ${JSON.stringify(apiUrl)}`),
  )

  const pkgDirectory = join(projectRoot, 'node_modules', '@yao-pkg', 'pkg')
  const pkgManifest = JSON.parse(await readFile(join(pkgDirectory, 'package.json'), 'utf8'))
  const pkgBin = typeof pkgManifest.bin === 'string' ? pkgManifest.bin : pkgManifest.bin?.pkg
  if (!pkgBin) {
    throw new Error('找不到 @yao-pkg/pkg 的命令列入口。')
  }

  const pkgResult = spawnSync(
    process.execPath,
    [
      resolve(pkgDirectory, pkgBin),
      entryPath,
      '--targets',
      'node22-win-x64',
      '--output',
      join(outputDirectory, 'dev-bots.exe'),
    ],
    { cwd: projectRoot, stdio: 'inherit' },
  )
  if (pkgResult.error) {
    throw pkgResult.error
  }
  if (pkgResult.status !== 0) {
    process.exitCode = pkgResult.status ?? 1
  } else {
    console.log(`已建立 ${join(outputDirectory, 'dev-bots.exe')}（API_URL: ${apiUrl}）`)
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
