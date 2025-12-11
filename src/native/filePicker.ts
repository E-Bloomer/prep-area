import { Filesystem } from '@capacitor/filesystem'
import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker'
import { base64ToUint8 } from '../utils/base64'
import { ensureFilesystemPermissions, isNativeApp, isPluginAvailable } from './platform'

const createFileFromBytes = (bytes: Uint8Array, name: string, mimeType: string): File => {
  const safeName = name || `file-${Date.now()}`
  const type = mimeType || 'application/octet-stream'
  const buffer = bytes.slice().buffer as ArrayBuffer
  const blob = new Blob([buffer], { type })
  if (typeof File === 'function') {
    return new File([blob], safeName, { type })
  }
  const fileLike = blob as File & { name?: string; lastModified?: number }
  fileLike.name = safeName
  fileLike.lastModified = Date.now()
  return fileLike
}

const materializePickerFile = async (file: PickedFile): Promise<File | null> => {
  const name = file.name ?? `file-${Date.now()}`
  const mimeType = file.mimeType ?? 'application/octet-stream'

  if (file.data) {
    const bytes = base64ToUint8(file.data)
    if (bytes.length === 0) return null
    return createFileFromBytes(bytes, name, mimeType)
  }

  if (file.blob) {
    return createFileFromBytes(new Uint8Array(await file.blob.arrayBuffer()), name, mimeType)
  }

  if (file.path) {
    await ensureFilesystemPermissions()
    const result = await Filesystem.readFile({
      path: file.path
    })
    const { data } = result
    if (!data) return null
    if (typeof data === 'string') {
      const bytes = base64ToUint8(data)
      return createFileFromBytes(bytes, name, mimeType)
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      return createFileFromBytes(new Uint8Array(await data.arrayBuffer()), name, mimeType)
    }
  }

  return null
}

export type NativeFilePickerSpec = string[]

export const pickNativeFile = async (
  mimeTypes: NativeFilePickerSpec
): Promise<File | null> => {
  if (!isNativeApp() || !isPluginAvailable('FilePicker')) return null
  try {
    const result = await FilePicker.pickFiles({
      types: mimeTypes,
      limit: 1,
      readData: true
    })
    const file = result.files?.[0]
    if (!file) return null
    return await materializePickerFile(file)
  } catch (err: any) {
    const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
    if (message.toLowerCase().includes('user cancelled') || message.toLowerCase().includes('user canceled')) {
      return null
    }
    console.warn('Native file picker failed', err)
    return null
  }
}
