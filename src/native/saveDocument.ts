import { registerPlugin } from '@capacitor/core'
import { uint8ToBase64 } from '../utils/base64'
import { isNativeApp } from './platform'

type SaveDocumentResult = {
  uri: string
  mimeType?: string | null
}

type SaveDocumentOptions = {
  filename: string
  bytes: Uint8Array
  mimeType: string
}

type SaveDocumentPlugin = {
  saveDocument: (options: { filename: string; data: string; mimeType?: string }) => Promise<SaveDocumentResult>
}

const SaveDocument = registerPlugin<SaveDocumentPlugin>('SaveDocument', {
  web: () => ({
    async saveDocument() {
      throw new Error('SaveDocument plugin is not available on this platform.')
    }
  })
})

export const saveDocumentWithDialog = async ({ filename, bytes, mimeType }: SaveDocumentOptions): Promise<SaveDocumentResult> => {
  if (!isNativeApp()) {
    throw new Error('saveDocumentWithDialog is only available on native platforms.')
  }
  const base64 = uint8ToBase64(bytes)
  return SaveDocument.saveDocument({ filename, data: base64, mimeType })
}
