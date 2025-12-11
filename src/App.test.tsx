import React from 'react'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import fs from 'fs'

const dbUrl = new URL('../public/content.sqlite', import.meta.url)
const dbBytes = fs.readFileSync(dbUrl)
const dbArrayBuffer = dbBytes.buffer.slice(dbBytes.byteOffset, dbBytes.byteOffset + dbBytes.byteLength) as ArrayBuffer

describe('App', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/content.sqlite')) {
        return new Response(dbArrayBuffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' }
        })
      }
      if (url.endsWith('/user.sqlite')) {
        const empty = new Uint8Array()
        const buffer = empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer
        return new Response(buffer, { status: 200 })
      }
      return new Response(null, { status: 404 })
    }))
    vi.stubGlobal('alert', vi.fn())
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    })))
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn()
    })))
    if (!globalThis.URL.createObjectURL) {
      Object.defineProperty(globalThis.URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(() => 'blob:mock')
      })
    }
    if (!globalThis.URL.revokeObjectURL) {
      Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn()
      })
    }
  })

  afterAll(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    cleanup()
  })

  it('renders without crashing', async () => {
    const { container } = render(<App />)
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })

  it('keeps filters visible when toggling owned filter', async () => {
    const { getByLabelText, getByPlaceholderText } = render(<App />)
    const searchInput = await waitFor(() => getByPlaceholderText('Search character/card name…'))
    expect(searchInput).toBeTruthy()

    const ownedCheckbox = getByLabelText('Owned') as HTMLInputElement
    fireEvent.click(ownedCheckbox)

    await waitFor(() => {
      expect(ownedCheckbox.checked).toBe(true)
      expect(getByPlaceholderText('Search character/card name…')).toBeTruthy()
    })
  })
})
