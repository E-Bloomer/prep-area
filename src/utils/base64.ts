export const uint8ToBase64 = (bytes: Uint8Array): string => {
  const nodeBuffer = typeof (globalThis as any).Buffer !== 'undefined'
    ? (globalThis as any).Buffer
    : null
  if (nodeBuffer) {
    return nodeBuffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  if (typeof btoa === 'function') {
    return btoa(binary)
  }
  return binary
}

export const base64ToUint8 = (data: string): Uint8Array => {
  const nodeBuffer = typeof (globalThis as any).Buffer !== 'undefined'
    ? (globalThis as any).Buffer
    : null
  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(data, 'base64'))
  }
  if (typeof atob === 'function') {
    const binary = atob(data)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  }
  return new Uint8Array()
}

