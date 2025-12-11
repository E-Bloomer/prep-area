import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { uint8ToBase64 } from '../utils/base64'
import { ensureFilesystemPermissions, isNativeApp } from './platform'

export type NativeBinarySource = {
  path: string
  directory: Directory
}

export type SaveNativeBinaryOptions = {
  filename: string
  bytes?: Uint8Array
  source?: NativeBinarySource
  directory?: Directory
  relativeDir?: string | string[]
  overwrite?: boolean
}

export type SaveNativeBinaryResult = {
  directory: Directory
  path: string
  uri: string | null
  displayPath: string
}

const normalizeSegment = (value: string): string => value.replace(/[\\/]/g, '').trim()

const normalizeFilename = (value: string): string => {
  const cleaned = value.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? `file-${Date.now()}`
  return cleaned.trim() || `file-${Date.now()}`
}

const sanitizeSegments = (input?: string | string[]): string[] => {
  if (!input) return []
  const raw = Array.isArray(input) ? input : input.split(/[\\/]/)
  return raw.map(normalizeSegment).filter(Boolean)
}

const directoryLabel = (dir: Directory): string => {
  if (dir === Directory.Documents) return 'Documents'
  if (dir === Directory.External) return 'External'
  if (dir === Directory.Data) return 'App Data'
  if (dir === Directory.ExternalStorage) return 'External Storage'
  if (dir === Directory.Library) return 'Library'
  if (dir === Directory.Cache) return 'Cache'
  return String(dir)
}

const preferredDirectory = (): Directory => {
  if (Capacitor.getPlatform() === 'android') return Directory.External
  return Directory.Documents
}

const uniqueDirectories = (dirs: Directory[]): Directory[] => {
  const seen = new Set<Directory>()
  const out: Directory[] = []
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    out.push(dir)
  }
  return out
}

const ensurePath = async (directory: Directory, segments: string[]) => {
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    try {
      await Filesystem.mkdir({ path: current, directory, recursive: true })
    } catch (err: any) {
      const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
      if (!message.toLowerCase().includes('already exists')) {
        const lower = message.toLowerCase()
        if (!lower.includes('already exists') && !lower.includes('directory exists')) {
          throw err
        }
      }
    }
  }
}

const removeIfExists = async (directory: Directory, path: string) => {
  try {
    await Filesystem.deleteFile({ path, directory })
  } catch {
    // ignore missing files
  }
}

const writeBytes = async (directory: Directory, path: string, bytes: Uint8Array) => {
  const payload = uint8ToBase64(bytes)
  await Filesystem.writeFile({
    path,
    directory,
    data: payload,
    recursive: true
  })
}

const copyFromSource = async (directory: Directory, path: string, source: NativeBinarySource) => {
  try {
    await Filesystem.copy({
      from: source.path,
      to: path,
      directory: source.directory,
      toDirectory: directory
    })
    return
  } catch (err) {
    // fallback to read + write
    const result = await Filesystem.readFile({
      path: source.path,
      directory: source.directory
    })
    const data = result.data
    if (typeof data === 'string') {
      await Filesystem.writeFile({
        path,
        directory,
        data,
        recursive: true
      })
      return
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buffer = await data.arrayBuffer()
      await writeBytes(directory, path, new Uint8Array(buffer))
      return
    }
    throw err
  }
}

export const saveNativeBinaryFile = async ({
  filename,
  bytes,
  source,
  directory,
  relativeDir,
  overwrite = true
}: SaveNativeBinaryOptions): Promise<SaveNativeBinaryResult> => {
  if (!isNativeApp()) {
    throw new Error('saveNativeBinaryFile is only available in the native wrapper')
  }
  if (!bytes && !source) {
    throw new Error('Either bytes or source must be provided.')
  }

  await ensureFilesystemPermissions()
  const safeFilename = normalizeFilename(filename)
  const pathSegments = sanitizeSegments(relativeDir)
  const attemptDirs = uniqueDirectories([
    directory ?? preferredDirectory(),
    Directory.Documents,
    Directory.External,
    Directory.ExternalStorage,
    Directory.Data
  ])

  let lastError: unknown = null
  for (const dir of attemptDirs) {
    try {
      await ensurePath(dir, pathSegments)
      const relativePath = pathSegments.length ? `${pathSegments.join('/')}/${safeFilename}` : safeFilename
      if (overwrite) {
        await removeIfExists(dir, relativePath)
      }
      if (source) {
        await copyFromSource(dir, relativePath, source)
      } else if (bytes) {
        await writeBytes(dir, relativePath, bytes)
      } else {
        throw new Error('No data provided.')
      }

      let uri: string | null = null
      try {
        const result = await Filesystem.getUri({ path: relativePath, directory: dir })
        uri = result.uri ?? null
      } catch {
        uri = null
      }

      const label = directoryLabel(dir)
      const displayPath = pathSegments.length
        ? `${label}/${pathSegments.join('/')}/${safeFilename}`
        : `${label}/${safeFilename}`

      return { directory: dir, path: relativePath, uri, displayPath }
    } catch (err) {
      console.warn('saveNativeBinaryFile attempt failed', dir, err)
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to save file in any available directory.')
}
