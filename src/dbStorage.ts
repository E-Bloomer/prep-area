import { Directory, Filesystem } from '@capacitor/filesystem'
import { base64ToUint8, uint8ToBase64 } from './utils/base64'
import { ensureFilesystemPermissions, isNativeApp } from './native/platform'

const DB_NAME = 'dicemasters-user-db'
const STORE_NAME = 'sqlite'
const KEY = 'user.sqlite'
const VERSION = 1
export const NATIVE_DB_PATH = 'user.sqlite'

type IDBDatabaseLike = IDBDatabase

const openStore = (): Promise<IDBDatabaseLike> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this environment.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

const readNativeBytes = async (): Promise<Uint8Array | null> => {
  if (!isNativeApp()) return null
  await ensureFilesystemPermissions()
  try {
    const result = await Filesystem.readFile({
      path: NATIVE_DB_PATH,
      directory: Directory.Data
    })
    const { data } = result
    if (!data) return null
    if (typeof data === 'string') {
      return base64ToUint8(data)
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const buffer = await data.arrayBuffer()
      return new Uint8Array(buffer)
    }
    return null
  } catch (err: any) {
    const message = String((err && typeof err === 'object' && 'message' in err) ? (err as any).message : '')
    if (message.toLowerCase().includes('does not exist')) {
      return null
    }
    console.warn('Unable to read user DB from native storage', err)
    return null
  }
}

const writeNativeBytes = async (bytes: Uint8Array): Promise<void> => {
  if (!isNativeApp()) return
  await ensureFilesystemPermissions()
  try {
    await Filesystem.writeFile({
      path: NATIVE_DB_PATH,
      directory: Directory.Data,
      data: uint8ToBase64(bytes),
      recursive: true
    })
  } catch (err) {
    console.warn('Unable to persist user database to native storage', err)
  }
}

export const loadUserDbBytes = async (): Promise<Uint8Array | null> => {
  if (isNativeApp()) {
    const nativeBytes = await readNativeBytes()
    if (nativeBytes) return nativeBytes
  }
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openStore()
    try {
      return await new Promise<Uint8Array | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(KEY)
        request.onerror = () => reject(request.error ?? new Error('Failed to read user DB'))
        request.onsuccess = async () => {
          const value = request.result
          if (!value) {
            resolve(null)
            return
          }
          if (value instanceof Uint8Array) {
            resolve(new Uint8Array(value))
            return
          }
          if (value instanceof ArrayBuffer) {
            resolve(new Uint8Array(value))
            return
          }
          if (value instanceof Blob) {
            try {
              const buffer = await value.arrayBuffer()
              resolve(new Uint8Array(buffer))
            } catch (err) {
              reject(err)
            }
            return
          }
          resolve(null)
        }
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export const saveUserDbBytes = async (bytes: Uint8Array): Promise<void> => {
  if (isNativeApp()) {
    await writeNativeBytes(bytes)
  }
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openStore()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const request = store.put(view, KEY)
        request.onerror = () => reject(request.error ?? new Error('Failed to write user DB'))
        request.onsuccess = () => resolve()
      })
    } finally {
      db.close()
    }
  } catch (err) {
    console.warn('Unable to persist user database to IndexedDB', err)
  }
}
