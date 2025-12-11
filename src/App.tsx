import React, { Suspense, lazy, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Directory } from '@capacitor/filesystem'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { loadUserDbBytes, saveUserDbBytes, NATIVE_DB_PATH } from './dbStorage'
import { OFFLINE_IMAGE_URLS, OFFLINE_IMAGE_COUNT } from './offlineAssets'
import { clearInstallPrompt, consumeInstallPrompt, onInstallPrompt } from './installPrompt'
import { ICONS_ROOT, IMAGES_ROOT, NO_AFFILIATION_LABEL, NO_AFFILIATION_TOKEN, USER_DB } from './constants/assets'
import { THEME_ACCENT, THEME_ACCENT_ACTIVE, THEME_ACCENT_HOVER, THEME_BG, THEME_BORDER, THEME_BUTTON, THEME_SURFACE, THEME_SURFACE_ALT, THEME_TEXT, THEME_TEXT_MUTED, THEME_WARNING } from './constants/theme'
import { AffIconImg, TokenIconImg } from './components/IconImages'
import { CountButton, NavButton } from './components/Buttons'
import { CardRow, AffIcon, AlignOpt, FormatOpt, CollectionStats, CountModalState, ImportReport, ImportRowIdentifier, Team, TeamCard, TradeCompareResult, TradePartnerTotals, TradeListEntry } from './types/models'
import { SearchPage, type SearchMode } from './pages/SearchPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import type { TeamSummary } from './pages/TeamsListPage'
import type { TeamCardInfo } from './pages/TeamDetailPage'
import type { ProxyDiceEntry } from './pages/ProxyDicePage'
import { isNativeApp } from './native/platform'
import { pickNativeFile } from './native/filePicker'
import { saveNativeBinaryFile } from './native/saveFile'
import { saveDocumentWithDialog } from './native/saveDocument'
import filterDataJson from './generated/filterData.json'
import './App.css'

const initSql = () => initSqlJs({ locateFile: (file: string) => `/${file}` })

const CardsPage = lazy(() => import('./pages/CardsPage').then((m) => ({ default: m.CardsPage })))
const CollectionPage = lazy(() => import('./pages/CollectionPage').then((m) => ({ default: m.CollectionPage })))
const CreditsPage = lazy(() => import('./pages/CreditsPage').then((m) => ({ default: m.CreditsPage })))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage').then((m) => ({ default: m.GlossaryPage })))
const KeywordsPage = lazy(() => import('./pages/KeywordsPage').then((m) => ({ default: m.KeywordsPage })))
const LifeCounterPage = lazy(() => import('./pages/LifeCounterPage').then((m) => ({ default: m.LifeCounterPage })))
const ProxyDicePage = lazy(() => import('./pages/ProxyDicePage').then((m) => ({ default: m.ProxyDicePage })))
const RulingsPage = lazy(() => import('./pages/RulingsPage').then((m) => ({ default: m.RulingsPage })))
const TeamAddPage = lazy(() => import('./pages/TeamAddPage').then((m) => ({ default: m.TeamAddPage })))
const TeamDetailPage = lazy(() => import('./pages/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })))
const TeamsListPage = lazy(() => import('./pages/TeamsListPage').then((m) => ({ default: m.TeamsListPage })))
const ToolsPage = lazy(() => import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })))
const TradeToolsPage = lazy(() => import('./pages/TradeToolsPage').then((m) => ({ default: m.TradeToolsPage })))

const TEAM_MAX_DICE = 20

type StaticFilterData = {
  setGroups: Array<{ group: string; display: string; hover: string }>
  universes: string[]
  energies: string[]
  rarities: string[]
  types: string[]
  genders: string[]
  formats: FormatOpt[]
  formatBans: Array<{ id: number; sets: number[]; cards: number[] }>
  alignments: AlignOpt[]
  affiliations: AffIcon[]
  affiliationExpansion: Array<{ token: string; tokens: string[] }>
  tokenIcons: Array<{ token: string; file: string; alt: string | null }>
  energyCodes: Array<{ code: string; file: string | null; alt: string | null }>
}

const staticFilters = filterDataJson as StaticFilterData

const STATIC_FORMAT_BANS_MAP = new Map<number, { sets: Set<number>; cards: Set<number> }>()
staticFilters.formatBans.forEach(({ id, sets, cards }) => {
  STATIC_FORMAT_BANS_MAP.set(id, {
    sets: new Set(sets),
    cards: new Set(cards)
  })
})

const STATIC_AFF_EXPANSION_MAP = new Map<string, Set<string>>()
staticFilters.affiliationExpansion.forEach(({ token, tokens }) => {
  STATIC_AFF_EXPANSION_MAP.set(token, new Set(tokens))
})

const STATIC_TOKEN_ICON_MAP = new Map<string, { file: string; alt: string | null }>()
staticFilters.tokenIcons.forEach(({ token, file, alt }) => {
  STATIC_TOKEN_ICON_MAP.set(token, { file, alt })
})

const STATIC_ENERGY_CODE_MAP = new Map<string, { file: string | null; alt: string | null }>()
staticFilters.energyCodes.forEach(({ code, file, alt }) => {
  STATIC_ENERGY_CODE_MAP.set(code, { file, alt })
})

const USER_DB_SCHEMA = `
  PRAGMA user_version = 2;
  CREATE TABLE IF NOT EXISTS collection (
    card_pk INTEGER PRIMARY KEY,
    have_dice INTEGER NOT NULL DEFAULT 0,
    have_cards INTEGER NOT NULL DEFAULT 0,
    have_foil  INTEGER NOT NULL DEFAULT 0,
    want INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS collection_dice (
    character_name TEXT NOT NULL,
    set_group TEXT NOT NULL,
    dice_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(character_name, set_group)
  );
  CREATE TABLE IF NOT EXISTS teams (
    team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS team_cards (
    team_id INTEGER NOT NULL,
    card_pk INTEGER NOT NULL,
    dice_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(team_id, card_pk)
  );
  CREATE INDEX IF NOT EXISTS idx_team_cards_team ON team_cards(team_id);
`

// ---------- types ----------
type ImageSideInfo = {
  side: string
  label: string
  rel_path: string | null
  url: string | null
  width: number | null
  height: number | null
}

type ImageInfo = { url: string | null, rel_path?: string | null, sides: ImageSideInfo[] }
const MANUAL_AFFILIATION_COMPOSITES: Record<string, string[]> = {
  '46': ['4', '6']
}

const HIDDEN_AFFILIATION_TOKENS = new Set(['4', '6'])

// ---------- helpers ----------
const nonEmpty = (s: any) => s != null && String(s).trim() !== ''

const normalizeEnergyToken = (token?: string | null) => {
  if (!token) return null
  const raw = String(token).trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  return upper
}

const parseEnergyTokens = (csv?: string | null) => {
  if (!csv) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of csv.split(',')) {
    const norm = normalizeEnergyToken(part)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

const ENERGY_TOKEN_ICON_MAP: Record<string, string> = {
  BOLT: 'e3.png',
  FIST: 'e2.png',
  MASK: 'e1.png',
  SHIELD: 'e4.png',
  GENERIC: 'e0.png'
}

const energyTokenIconFile = (token?: string | null) => {
  if (!token) return null
  const norm = normalizeEnergyToken(token)
  if (!norm) return null
  return ENERGY_TOKEN_ICON_MAP[norm] ?? null
}

const normalizeSearchValue = (value: unknown) => {
  if (value == null) return ''
  const str = String(value)
  if (!str) return ''
  const lower = str.toLowerCase()
  const expanded = lower.replace(/\[([^\]]+)\]/g, ' $1 ')
  return expanded.replace(/\s+/g, ' ').trim()
}

const energyCodeRank = (code?: string | null) => {
  if (!code) return 999
  const norm = String(code).trim().toUpperCase()
  if (!norm) return 999
  const numeric = Number(norm)
  if (!Number.isNaN(numeric)) return numeric
  const char = norm.charCodeAt(0)
  if (char >= 65 && char <= 90) return 10 + (char - 65)
  return 999
}

const genderLabel = (g?: string | null) => {
  if (g == null) return ''
  const s = String(g).trim()
  if (s === '0') return 'Male'
  if (s === '1') return 'Female'
  if (s === '2') return 'Other'
  return s
}

const isBasic = (t?: string | null) => {
  if (!t) return false
  const x = t.toLowerCase()
  return x.includes('basic action')
}

const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

type TradeSnapshotDiceEntry = {
  key: string
  character: string
  set: string
  groupLabel: string
  required: number
  owned: number
  spare: number
  need: number
  repCardPk: number | null
}

type TradeSnapshot = {
  cardDetailMap: Map<number, TradeSnapshotCardDetail>
  diceEntries: TradeSnapshotDiceEntry[]
  diceNeedMap: Map<string, TradeSnapshotDiceEntry>
  diceSpareMap: Map<string, TradeSnapshotDiceEntry>
  diceByCardPk: Map<number, TradeSnapshotDiceEntry>
}

type TradeSnapshotCardDetail = {
  cardPk: number
  set: string
  groupLabel: string
  character: string
  cardName: string
  cardType: string | null
  cost: number | null
  standardOwned: number
  foilOwned: number
  spareStandard: number
  spareFoil: number
  needStandard: number
  needFoil: number
  needAny: number
  preferFoil: boolean
  hasFoil: boolean
  diceKey: string
  dice?: {
    owned: number
    required: number
    spare: number
    need: number
  }
}

type TradePartnerCardInfo = {
  spareStandard: number
  spareFoil: number
  needStandard: number
  needFoil: number
  needAny: number
}

type TradePartnerDiceInfo = {
  spare: number
  need: number
  owned: number
  required: number
}

type TradePartnerData = {
  cards: Map<number, TradePartnerCardInfo>
  dice: Map<string, TradePartnerDiceInfo>
  unmatched: ImportRowIdentifier[]
  totals: TradePartnerTotals
}

// ---------- db hook ----------
function useDBs() {
  const [ready, setReady] = useState(false)
  const [contentDb, setContentDb] = useState<Database | null>(null)
  const [userDb, setUserDb] = useState<Database | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const sqlModuleRef = useRef<SqlJsStatic | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const SQL = await initSql()
      const getContentBytes = async (): Promise<Uint8Array> => {
        try {
          const resp = await fetch('/content.sqlite', { cache: 'no-store' })
          if (!resp.ok) throw new Error(`Failed to load content.sqlite (${resp.status})`)
          return new Uint8Array(await resp.arrayBuffer())
        } catch (err) {
          if (typeof caches !== 'undefined') {
            const cached = await caches.match('/content.sqlite')
            if (cached) {
              const buf = await cached.arrayBuffer()
              return new Uint8Array(buf)
            }
          }
          throw err
        }
      }

      const contentBytes = await getContentBytes()
      const cdb = new SQL.Database(contentBytes)
      sqlModuleRef.current = SQL

      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open('sqlite-cache')
          const cloned = contentBytes.slice()
          const response = new Response(cloned, {
            headers: { 'Content-Type': 'application/octet-stream' }
          })
          await cache.put('/content.sqlite', response)
        } catch (err) {
          console.warn('Failed to seed content.sqlite cache', err)
        }
      }

      let userBytes = await loadUserDbBytes()
      if (userBytes && userBytes.length === 0) {
        userBytes = null
      }
      const udb = userBytes ? new SQL.Database(userBytes) : new SQL.Database()
      udb.run(USER_DB_SCHEMA)
      if (!userBytes) {
        try {
          await saveUserDbBytes(udb.export())
        } catch (err) {
          console.warn('Unable to seed user DB in storage', err)
        }
      }

      if (!cancelled) {
        setContentDb(cdb)
        setUserDb(udb)
        setReady(true)
      }
    })().catch((e) => { console.error(e); alert((e as Error).message) })
    return () => { cancelled = true }
  }, [])

  const tryRun = useCallback((db: Database | null, sql: string, params: (string|number|null)[] = []) => {
    if (!db) return { ok: false, rows: [] as any[], error: new Error('DB not ready') }
    try {
      const stmt = db.prepare(sql); stmt.bind(params)
      const rows: any[] = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free()
      return { ok: true, rows, error: null as any }
    } catch (err: any) { return { ok: false, rows: [], error: err } }
  }, [])

  const runUser = useCallback((sql: string, params: (string|number|null)[] = []) => {
    if (!userDb) return []
    const s = userDb.prepare(sql); s.bind(params)
    const rows: any[] = []; while (s.step()) rows.push(s.getAsObject()); s.free()
    return rows
  }, [userDb])

  const scheduleUserDbSave = useCallback(() => {
    if (!userDb) return
    const persist = async () => {
      try {
        const bytes = userDb.export()
        await saveUserDbBytes(bytes)
      } catch (err) {
        console.warn('Failed to persist user DB', err)
      }
    }
    if (typeof window === 'undefined') {
      void persist()
      return
    }
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persist()
    }, 400)
  }, [userDb])

  const exportUserDb = useCallback(async () => {
    if (!userDb) return
    const bytes = userDb.export()
    await saveUserDbBytes(bytes)
    if (isNativeApp()) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-').replace('Z', '')
      const filename = `prep-area-backup-${timestamp}.sqlite`
      try {
        await saveDocumentWithDialog({
          filename,
          bytes,
          mimeType: 'application/x-sqlite3'
        })
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert('Backup saved.')
        }
      } catch (dialogErr) {
        console.warn('Save dialog failed, falling back to internal storage', dialogErr)
        try {
          const result = await saveNativeBinaryFile({
            filename,
            source: {
              path: NATIVE_DB_PATH,
              directory: Directory.Data
            },
            directory: Directory.Documents,
            relativeDir: ['Prep Area', 'Exports']
          })
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`Backup saved to ${result.displayPath}.`)
          }
        } catch (err) {
          console.error('Failed to save native backup', err)
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('Failed to save backup on this device.')
          }
        }
      }
      return
    }
    const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer as ArrayBuffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const blob = new Blob([view], { type: 'application/octet-stream' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = USER_DB; a.click()
    URL.revokeObjectURL(a.href)
  }, [userDb])

  const restoreUserDb = useCallback(async (bytes: Uint8Array) => {
    let sqlModule = sqlModuleRef.current
    if (!sqlModule) {
      sqlModule = await initSql()
      sqlModuleRef.current = sqlModule
    }
    if (!sqlModule) {
      throw new Error('Unable to initialize SQL module')
    }
    const nextDb = new sqlModule.Database(bytes)
    nextDb.run(USER_DB_SCHEMA)
    setUserDb(nextDb)
    await saveUserDbBytes(nextDb.export())
    return nextDb
  }, [])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && userDb) {
        void saveUserDbBytes(userDb.export())
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [userDb])

  return { ready, contentDb, tryRun, runUser, exportUserDb, restoreUserDb, scheduleUserDbSave }
}

function hasTable(db: Database | null, name: string): boolean {
  if (!db) return false
  try { const s = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`); s.bind([name]); const ok = s.step(); s.free(); return !!ok } catch { return false }
}

// ---------- App ----------
export default function App() {
  const { ready, contentDb, tryRun, runUser, exportUserDb, restoreUserDb, scheduleUserDbSave } = useDBs()
  const nativeEnv = isNativeApp()

  const themeVars = useMemo(
    () =>
      ({
        '--theme-bg': THEME_BG,
        '--theme-surface': THEME_SURFACE,
        '--theme-surface-alt': THEME_SURFACE_ALT,
        '--theme-button': THEME_BUTTON,
        '--theme-border': THEME_BORDER,
        '--theme-accent': THEME_ACCENT,
        '--theme-accent-hover': THEME_ACCENT_HOVER,
        '--theme-accent-active': THEME_ACCENT_ACTIVE,
        '--theme-warning': THEME_WARNING,
        '--theme-text': THEME_TEXT,
        '--theme-text-muted': THEME_TEXT_MUTED
      }) as React.CSSProperties,
    []
  )

  // Pages
  type Page =
    | 'Search'
    | 'Cards'
    | 'Teams'
    | 'Collection'
    | 'Trade Tools'
    | 'Keywords'
    | 'Tools'
    | 'Rulings'
    | 'Proxy Dice'
    | 'Life Counter'
    | 'Glossary'
    | 'Credits'
  const [page, setPage] = useState<Page>('Search')
  const pageHistoryRef = useRef<Page[]>([])
  const goToPage = useCallback(
    (nextPage: Page, options?: { replace?: boolean }) => {
      setPage(prev => {
        if (prev === nextPage) {
          return prev
        }
        if (!options?.replace) {
          pageHistoryRef.current.push(prev)
        }
        return nextPage
      })
    },
    []
  )
  const handleToolsNavigate = useCallback((next: string) => {
    goToPage(next as Page)
  }, [goToPage])

  const popPage = useCallback(() => {
    const previous = pageHistoryRef.current.pop()
    if (!previous) return false
    setPage(previous)
    return true
  }, [])
  const primaryPages: Page[] = ['Search', 'Cards', 'Teams', 'Tools']
  const extraPages: Page[] = []
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const [morePos, setMorePos] = useState<{ top: number; right: number } | null>(null)
  const [cardsMenuOpen, setCardsMenuOpen] = useState(false)
  const cardsMenuBtnRef = useRef<HTMLButtonElement | null>(null)
  const cardsMenuRef = useRef<HTMLDivElement | null>(null)
  const [cardsMenuPos, setCardsMenuPos] = useState<{ top: number; right: number } | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)
  const [navHeight, setNavHeight] = useState(0)
  const [isSmallScreen, setIsSmallScreen] = useState(false)

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    const body = document.body
    const prevHtmlStyles = {
      background: html.style.backgroundColor,
      color: html.style.color,
      height: html.style.height
    }
    const prevBodyStyles = {
      background: body.style.backgroundColor,
      color: body.style.color,
      margin: body.style.margin,
      minHeight: body.style.minHeight,
      touchAction: body.style.touchAction,
      overscrollBehavior: body.style.overscrollBehavior
    }
    html.style.backgroundColor = THEME_BG
    html.style.color = THEME_TEXT
    html.style.height = '100%'
    body.style.backgroundColor = THEME_BG
    body.style.color = THEME_TEXT
    body.style.margin = '0'
    body.style.minHeight = '100vh'
    body.style.touchAction = 'manipulation'
    body.style.overscrollBehavior = 'contain'
    return () => {
      html.style.backgroundColor = prevHtmlStyles.background
      html.style.color = prevHtmlStyles.color
      html.style.height = prevHtmlStyles.height
      body.style.backgroundColor = prevBodyStyles.background
      body.style.color = prevBodyStyles.color
      body.style.margin = prevBodyStyles.margin
      body.style.minHeight = prevBodyStyles.minHeight
      body.style.touchAction = prevBodyStyles.touchAction
      body.style.overscrollBehavior = prevBodyStyles.overscrollBehavior
    }
  }, [])

  // Filters / search state
  const [q, setQ] = useState('')
  const deferredQuery = useDeferredValue(q)
  const [searchMode, setSearchMode] = useState<SearchMode>('name')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]) // sets.set_group
  const [energySel, setEnergySel] = useState<string[]>([])           // energy tokens
  const [universeSel, setUniverseSel] = useState<string[]>([])
  const [raritySel, setRaritySel] = useState<string[]>([])
  const [ownedYes, setOwnedYes] = useState(false)
  const [ownedNo, setOwnedNo] = useState(false)
  const [costSel, setCostSel] = useState<number[]>([])
  const [typeSel, setTypeSel] = useState<string[]>([])
  const [genderSel, setGenderSel] = useState<string[]>([])           // 'Male'|'Female'|'Other'
  const [affSel, setAffSel] = useState<string[]>([])                 // affiliation tokens
  const [alignSel, setAlignSel] = useState<string[]>([])             // alignment tokens
  const [formatSel, setFormatSel] = useState<number | null>(null)
  const [teamsVersion, setTeamsVersion] = useState(0)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)

  // Expand/collapse groups
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})
  const [allOpen, setAllOpen] = useState(true)
  const toggleAll = (wantOpen: boolean, keys: string[]) => {
    const next: Record<string, boolean> = {}
    keys.forEach(k => { next[k] = wantOpen })
    setOpenKeys(next)
    setAllOpen(wantOpen)
  }

  // Inline counter editors (show +/- only when clicked)
  const [collectionVersion, setCollectionVersion] = useState(0)
  const [countModal, setCountModal] = useState<CountModalState | null>(null)
  const [massMode, setMassMode] = useState<'none' | 'plus' | 'minus'>('none')
  const [diceLinkMode, setDiceLinkMode] = useState<'none' | 'd1' | 'd2'>('none')
  const [teamView, setTeamView] = useState<'list' | 'detail' | 'add'>('list')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const installPromptRef = useRef<any>(null)
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [statsData, setStatsData] = useState<CollectionStats | null>(null)
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const [tradeKeepBoth, setTradeKeepBoth] = useState(false)
  const [tradeImporting, setTradeImporting] = useState(false)
  const [tradeImportError, setTradeImportError] = useState<string | null>(null)
  const tradeFileInputRef = useRef<HTMLInputElement | null>(null)
  const backupFileInputRef = useRef<HTMLInputElement | null>(null)
  const [backupImporting, setBackupImporting] = useState(false)
  const [backupImportError, setBackupImportError] = useState<string | null>(null)
  const [tradePartnerData, setTradePartnerData] = useState<TradePartnerData | null>(null)
  const [canInstallPwa, setCanInstallPwa] = useState(false)
  const totalOfflineImages = OFFLINE_IMAGE_COUNT
  const [imageCacheStatus, setImageCacheStatus] = useState<'idle' | 'downloading' | 'complete' | 'error' | 'unsupported'>('idle')
  const [imageCacheProgress, setImageCacheProgress] = useState(0)
  const [imageCacheMessage, setImageCacheMessage] = useState<string | null>(null)
  const [installUnavailableReason, setInstallUnavailableReason] = useState<string | null>(null)

  const bumpCollection = useCallback(() => {
    setCollectionVersion(v => v + 1)
    scheduleUserDbSave()
  }, [scheduleUserDbSave])

  const bumpTeams = useCallback(() => {
    setTeamsVersion(v => v + 1)
    scheduleUserDbSave()
  }, [scheduleUserDbSave])

  // ---------- Datasets for filters ----------
  const setGroups = useMemo(() => {
    if (!ready) return staticFilters.setGroups
    const { rows } = tryRun(contentDb, `
      WITH base AS (
        SELECT
          CASE WHEN s.set_group IS NULL OR s.set_group = '' THEN 'Other' ELSE s.set_group END AS group_key,
          COALESCE(NULLIF(s.set_alt, ''), CASE WHEN s.set_group IS NULL OR s.set_group = '' THEN 'Other' ELSE s.set_group END) AS display_label,
          COALESCE(
            NULLIF(s.full_name, ''),
            COALESCE(NULLIF(s.set_alt, ''), CASE WHEN s.set_group IS NULL OR s.set_group = '' THEN 'Other' ELSE s.set_group END)
          ) AS hover_label,
          CASE
            WHEN s.full_name IS NOT NULL AND s.full_name <> '' THEN 0
            WHEN LOWER(COALESCE(s.set_alt, '')) LIKE '%op' THEN 3
            WHEN COALESCE(s.set_alt, '') GLOB '*[0-9]*' THEN 4
            ELSE 1
          END AS pref
        FROM sets s
        WHERE EXISTS (SELECT 1 FROM cards c WHERE c.set_id = s.set_id)
      )
      , ranked AS (
        SELECT
          group_key,
          display_label,
          hover_label,
          ROW_NUMBER() OVER (
            PARTITION BY group_key
            ORDER BY pref, CASE WHEN display_label = group_key THEN 1 ELSE 0 END, display_label COLLATE NOCASE
          ) AS rn
        FROM base
      )
      SELECT group_key, display_label, hover_label
      FROM ranked
      WHERE rn = 1
      ORDER BY display_label COLLATE NOCASE
    `)
    return (rows as any[])
      .map((r) => {
        const group = String(r.group_key || 'Other')
        const display = String(r.display_label || group)
        const hover = String(r.hover_label || display)
        return { group, display, hover }
      })
      .filter(({ group }) => group.replace(/\s+/g, '').toLowerCase() !== 'sk2017')
  }, [ready, contentDb, tryRun])

  const setGroupLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const { group, display } of setGroups) {
      map.set(group, display)
    }
    if (!map.has('Other')) {
      map.set('Other', 'Other')
    }
    return map
  }, [setGroups])

  const getTradeSetInfo = useCallback((row: CardRow | null | undefined) => {
    if (!row) return { groupLabel: 'Other', setDisplay: 'Unknown Set' }
    const rawGroup = (row.set_group ?? '').trim()
    const fallback = (row.set_label ?? '').trim()
    const groupLabel = rawGroup || fallback || 'Other'
    const setDisplay = rawGroup ? (setGroupLabelMap.get(rawGroup) ?? rawGroup) : (fallback || 'Unknown Set')
    return { groupLabel, setDisplay }
  }, [setGroupLabelMap])

  const universes = useMemo(() => {
    if (!ready) return staticFilters.universes
    const { rows } = tryRun(contentDb, `
      SELECT DISTINCT s.universe FROM sets s
      WHERE s.universe IS NOT NULL AND s.universe <> ''
      ORDER BY s.universe
    `)
    return rows.map((r: any) => r.universe as string)
  }, [ready, contentDb, tryRun])

  const energies = useMemo(() => {
    if (!ready) return staticFilters.energies
    if (!hasTable(contentDb, 'card_rows')) return []
    const { rows } = tryRun(contentDb, `
      SELECT energy_code, energy_tokens FROM card_rows
      WHERE energy_tokens IS NOT NULL AND energy_tokens <> ''
    `)
    const tokens = new Set<string>()
    const rankByToken = new Map<string, number>()
    for (const r of rows as any[]) {
      const rowTokens = parseEnergyTokens(r.energy_tokens)
      if (!rowTokens.length) continue
      const rank = energyCodeRank(r.energy_code)
      for (const tok of rowTokens) {
        tokens.add(tok)
        const current = rankByToken.get(tok)
        if (current == null || rank < current) {
          rankByToken.set(tok, rank)
        }
      }
    }
    return Array.from(tokens)
      .map((token) => ({ token, rank: rankByToken.get(token) ?? 999 }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        return a.token.localeCompare(b.token)
      })
      .map(({ token }) => token)
  }, [ready, contentDb, tryRun])

  const rarities = useMemo(() => {
    if (!ready) return staticFilters.rarities
    if (!hasTable(contentDb, 'card_rows')) return []
    const { rows } = tryRun(contentDb, `
      SELECT rarity, MIN(COALESCE(rarity_rank, 9999)) AS rarity_rank
      FROM card_rows
      WHERE rarity IS NOT NULL AND rarity <> ''
      GROUP BY rarity
      ORDER BY rarity_rank, rarity
    `)
    return (rows as any[])
      .map((r) => r.rarity as string)
      .filter(nonEmpty)
  }, [ready, contentDb, tryRun])

  const types = useMemo(() => {
    if (!ready) return staticFilters.types
    if (!hasTable(contentDb, 'card_rows')) return []
    const { rows } = tryRun(contentDb, `
      SELECT DISTINCT type_name FROM card_rows
      WHERE type_name IS NOT NULL AND type_name <> ''
      ORDER BY type_name
    `)
    return rows.map((r: any) => r.type_name as string)
  }, [ready, contentDb, tryRun])

  const genders = useMemo(() => {
    if (!ready) return staticFilters.genders
    if (!hasTable(contentDb, 'card_rows')) return []
    const { rows } = tryRun(contentDb, `
      SELECT DISTINCT gender FROM card_rows
      WHERE gender IS NOT NULL AND gender <> ''
      ORDER BY gender
    `)
    // map 0/1/2 to labels
    const set = new Set<string>()
    for (const r of rows as any[]) {
      set.add(genderLabel(r.gender))
    }
    return Array.from(set).filter(nonEmpty)
  }, [ready, contentDb, tryRun])

  const { formats, formatBans } = useMemo(() => {
    if (!ready || !contentDb || !hasTable(contentDb, 'formats')) {
      return { formats: staticFilters.formats, formatBans: STATIC_FORMAT_BANS_MAP }
    }

    const list: FormatOpt[] = []
    const bans = new Map<number, { sets: Set<number>; cards: Set<number> }>()

    const fmtRows = tryRun(contentDb, `
      SELECT format_id, code, name, notes
      FROM formats
      ORDER BY name
    `).rows as any[]

    for (const row of fmtRows) {
      list.push({
        id: Number(row.format_id),
        code: row.code ? String(row.code) : null,
        name: String(row.name),
        notes: row.notes != null ? String(row.notes) : null
      })
    }

    const ensure = (id: number) => {
      if (!bans.has(id)) bans.set(id, { sets: new Set<number>(), cards: new Set<number>() })
      return bans.get(id)!
    }

    if (hasTable(contentDb, 'format_banned_sets')) {
      const { rows } = tryRun(contentDb, `SELECT format_id, set_id FROM format_banned_sets`)
      for (const row of rows as any[]) {
        const id = Number(row.format_id)
        const setId = Number(row.set_id)
        if (!Number.isNaN(id) && !Number.isNaN(setId)) {
          ensure(id).sets.add(setId)
        }
      }
    }

    if (hasTable(contentDb, 'format_banned_cards')) {
      const { rows } = tryRun(contentDb, `SELECT format_id, card_pk FROM format_banned_cards`)
      for (const row of rows as any[]) {
        const id = Number(row.format_id)
        const cardPk = Number(row.card_pk)
        if (!Number.isNaN(id) && !Number.isNaN(cardPk)) {
          ensure(id).cards.add(cardPk)
        }
      }
    }

    const filtered = list.filter((f) => {
      const entry = bans.get(f.id)
      return entry && (entry.sets.size > 0 || entry.cards.size > 0)
    })

    return { formats: filtered, formatBans: bans }
  }, [ready, contentDb, tryRun])

  useEffect(() => {
    if (formatSel != null && !formats.some(f => f.id === formatSel)) {
      setFormatSel(null)
    }
  }, [formatSel, formats])

  useEffect(() => {
    setMoreOpen(false)
  }, [page])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.isSecureContext) {
      setInstallUnavailableReason(null)
      setCanInstallPwa(false)
      return
    }
    setInstallUnavailableReason(null)
    const existing = consumeInstallPrompt()
    if (existing) {
      installPromptRef.current = existing
      setCanInstallPwa(true)
    }
    const unsubscribe = onInstallPrompt((event) => {
      installPromptRef.current = event
      setCanInstallPwa(true)
    })
    const handleInstalled = () => {
      installPromptRef.current = null
      clearInstallPrompt()
      setCanInstallPwa(false)
    }
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      unsubscribe()
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useLayoutEffect(() => {
    const calcHeight = () => {
      if (!navRef.current) return
      const rect = navRef.current.getBoundingClientRect()
      setNavHeight(rect.height)
    }
    calcHeight()
    window.addEventListener('resize', calcHeight)
    return () => window.removeEventListener('resize', calcHeight)
  }, [])

  useEffect(() => {
    if (!navRef.current) return
    const rect = navRef.current.getBoundingClientRect()
    setNavHeight(rect.height)
  }, [isSmallScreen])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return
    const media = window.matchMedia('(max-width: 768px)')
    const update = () => setIsSmallScreen(media.matches)
    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    if (!moreOpen) {
      setMorePos(null)
      return
    }
    const calcPos = () => {
      if (!moreBtnRef.current) return
      const rect = moreBtnRef.current.getBoundingClientRect()
      setMorePos({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right)
      })
    }
    calcPos()
    window.addEventListener('resize', calcPos)
    window.addEventListener('scroll', calcPos, true)
    return () => {
      window.removeEventListener('resize', calcPos)
      window.removeEventListener('scroll', calcPos, true)
    }
  }, [moreOpen])

useEffect(() => {
  if (!cardsMenuOpen) {
    setCardsMenuPos(null)
    return
  }
    const calcPos = () => {
      if (!cardsMenuBtnRef.current) return
      const rect = cardsMenuBtnRef.current.getBoundingClientRect()
      setCardsMenuPos({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right)
      })
    }
    calcPos()
    window.addEventListener('resize', calcPos)
    window.addEventListener('scroll', calcPos, true)
    return () => {
      window.removeEventListener('resize', calcPos)
      window.removeEventListener('scroll', calcPos, true)
    }
}, [cardsMenuOpen])

  useEffect(() => {
    if (!moreOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && (
        moreMenuRef.current?.contains(target) ||
        moreBtnRef.current?.contains(target)
      )) {
        return
      }
      setMoreOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!cardsMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && (
        cardsMenuRef.current?.contains(target) ||
        cardsMenuBtnRef.current?.contains(target)
      )) {
        return
      }
      setCardsMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [cardsMenuOpen])

  useEffect(() => {
    if (!isSmallScreen && moreOpen) {
      setMoreOpen(false)
    }
  }, [isSmallScreen, moreOpen])

  useEffect(() => {
    if (moreOpen && cardsMenuOpen) {
      setCardsMenuOpen(false)
    }
  }, [moreOpen, cardsMenuOpen])

  useEffect(() => {
    if (page !== 'Cards' && cardsMenuOpen) {
      setCardsMenuOpen(false)
    }
  }, [page, cardsMenuOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.isSecureContext) {
      setImageCacheStatus('unsupported')
      setImageCacheMessage('Offline caching requires HTTPS (or localhost). Serve the app securely and try again.')
      return
    }
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
      setImageCacheStatus('unsupported')
      setImageCacheMessage('Offline image caching is unavailable in this browser.')
      return
    }
    let cancelled = false
    navigator.serviceWorker.ready
      .then(async () => {
        if (cancelled) return
        try {
          const cache = await caches.open('card-images-v2')
          if (cancelled) return
          const keys = await cache.keys()
          if (cancelled) return
          const cachedCount = keys.length
          if (cachedCount >= totalOfflineImages && totalOfflineImages > 0) {
            setImageCacheStatus('complete')
            setImageCacheProgress(totalOfflineImages)
            setImageCacheMessage('Images already cached for offline use.')
          } else if (cachedCount > 0) {
            setImageCacheProgress(Math.min(cachedCount, totalOfflineImages))
            setImageCacheMessage('Partial cache detected. You can re-run the download to fetch missing files.')
          } else {
            setImageCacheMessage('Images are not cached yet. Use the download button below while online.')
          }
        } catch (err) {
          if (!cancelled) {
            console.warn('Failed to inspect image cache', err)
            setImageCacheMessage('Unable to inspect cached images. You can still attempt the download below.')
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Service worker not ready for image cache', err)
          setImageCacheMessage('Service worker is not ready yet. Reload once the app is fully loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [totalOfflineImages])

  const selectedFormat = useMemo(() => {
    if (formatSel == null) return null
    return formats.find(f => f.id === formatSel) ?? null
  }, [formatSel, formats])

  const resetFilters = useCallback(() => {
    setQ('')
    setSelectedGroups([])
    setTypeSel([])
    setEnergySel([])
    setCostSel([])
    setOwnedYes(false)
    setOwnedNo(false)
    setGenderSel([])
    setRaritySel([])
    setUniverseSel([])
    setAlignSel([])
    setAffSel([])
    setFormatSel(null)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const preventPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    }
    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    }
    document.addEventListener('touchmove', preventPinch, { passive: false })
    document.addEventListener('wheel', preventWheelZoom, { passive: false })
    return () => {
      document.removeEventListener('touchmove', preventPinch)
      document.removeEventListener('wheel', preventWheelZoom)
    }
  }, [])

  // new: tokens for affiliation & alignment
  const { affList, affExpansion } = useMemo(() => {
    if (!ready) {
      return { affList: staticFilters.affiliations, affExpansion: STATIC_AFF_EXPANSION_MAP }
    }

    const display: AffIcon[] = []
    const expansion = new Map<string, Set<string>>()
    const { rows } = tryRun(
      contentDb,
      `SELECT token, file, alt, COALESCE(is_composite,0) as is_composite, components
       FROM affiliation_icons
       ORDER BY token`
    )
    const allRows = rows as AffIcon[]

    const componentMap = new Map<string, string[]>()
    const parseComponents = (raw: string | null) =>
      (raw || '').split(',').map(s => s.trim()).filter(nonEmpty)

    for (const row of allRows) {
      const normalizedToken = row.token === '0' ? NO_AFFILIATION_TOKEN : row.token
      componentMap.set(normalizedToken, parseComponents(row.components))
    }

    for (const [tok, comps] of Object.entries(MANUAL_AFFILIATION_COMPOSITES)) {
      componentMap.set(tok, comps)
    }

    let hasNoAffiliation = false

    for (const row of allRows) {
      const normalizedToken = row.token === '0' ? NO_AFFILIATION_TOKEN : row.token
      const include =
        (!HIDDEN_AFFILIATION_TOKENS.has(row.token) && row.is_composite === 0) ||
        MANUAL_AFFILIATION_COMPOSITES[row.token] != null

      if (include) {
        const entry = { ...row, token: normalizedToken }
        if (normalizedToken === NO_AFFILIATION_TOKEN) {
          entry.alt = NO_AFFILIATION_LABEL
          entry.file = row.file || 'a0.png'
          hasNoAffiliation = true
        }
        display.push(entry)
      }
    }

    for (const [tok] of Object.entries(MANUAL_AFFILIATION_COMPOSITES)) {
      if (!display.some(d => d.token === tok)) {
        const base = allRows.find(r => r.token === tok)
        if (base) display.push(base)
      }
    }

    if (!componentMap.has(NO_AFFILIATION_TOKEN)) {
      componentMap.set(NO_AFFILIATION_TOKEN, [])
    }
    if (!hasNoAffiliation) {
      display.unshift({
        token: NO_AFFILIATION_TOKEN,
        file: 'a0.png',
        alt: NO_AFFILIATION_LABEL,
        is_composite: 0,
        components: null
      })
    }

    const expandToken = (token: string, trail: Set<string> = new Set()): Set<string> => {
      if (expansion.has(token)) return expansion.get(token)!
      if (trail.has(token)) return new Set([token])
      const nextTrail = new Set(trail)
      nextTrail.add(token)
      const set = new Set<string>([token])
      const comps = componentMap.get(token) ?? []
      for (const comp of comps) {
        const expanded = expandToken(comp, nextTrail)
        expanded.forEach(t => set.add(t))
      }
      expansion.set(token, set)
      return set
    }

    componentMap.forEach((_comps, token) => {
      expandToken(token)
    })

    const seen = new Set<string>()
    const unique = display.filter(row => {
      if (seen.has(row.token)) return false
      seen.add(row.token)
      return true
    })

    return { affList: unique, affExpansion: expansion }
  }, [ready, contentDb, tryRun])

  const tokenIconMap = useMemo(() => {
    if (!ready) return STATIC_TOKEN_ICON_MAP
    const map = new Map<string, { file: string; alt?: string | null }>()
    if (!contentDb || !hasTable(contentDb, 'token_icons')) return map
    const { rows } = tryRun(contentDb, `SELECT token, file, alt FROM token_icons`)
    for (const row of rows as any[]) {
      const tk = String(row.token ?? '')
      const file = row.file
      if (!nonEmpty(tk) || !nonEmpty(file)) continue
      map.set(tk, { file: String(file), alt: row.alt })
    }
    return map
  }, [ready, contentDb, tryRun])

  const energyCodeMap = useMemo(() => {
    if (!ready) return STATIC_ENERGY_CODE_MAP
    const map = new Map<string, { file: string | null; alt: string | null }>()
    if (!contentDb || !hasTable(contentDb, 'energy_codes')) return map
    const { rows } = tryRun(contentDb, `SELECT code, file, alt FROM energy_codes`)
    for (const row of rows as any[]) {
      const code = String(row.code ?? '')
      if (!nonEmpty(code)) continue
      map.set(code, { file: row.file ?? null, alt: row.alt ?? null })
    }
    return map
  }, [ready, contentDb, tryRun])

  const iconFileFor = useCallback((token?: string | null) => {
    if (!token) return null
    const searchKeys = [
      token,
      token.toUpperCase(),
      token.toLowerCase()
    ]
    for (const key of searchKeys) {
      const entry = tokenIconMap.get(key)
      if (entry) return entry.file
    }
    for (const entry of tokenIconMap.values()) {
      const alt = entry.alt && String(entry.alt)
      if (alt && alt.toLowerCase() === token.toLowerCase()) return entry.file
    }
    return null
  }, [tokenIconMap])

  const alignList = useMemo(() => {
    if (!ready) return staticFilters.alignments
    const { rows } = tryRun(contentDb, `SELECT token, name FROM alignments ORDER BY name`)
    return rows as AlignOpt[]
  }, [ready, contentDb, tryRun])

  const cardSearchMap = useMemo(() => {
    const map = new Map<number, { text: string; global: string; name: string; subname: string; maxDice: number }>()
    if (!ready || !contentDb || !hasTable(contentDb, 'cards')) return map
    const { rows } = tryRun(contentDb, `
      SELECT card_pk, text_src, global_text_src, name, subname, maxdice
      FROM cards
    `)
    const toLower = (value: unknown, trim = false) => {
      if (value == null) return ''
      const str = String(value).toLowerCase()
      return trim ? str.trim() : str
    }
    for (const row of rows as any[]) {
      const pk = Number(row.card_pk)
      if (!Number.isInteger(pk)) continue
      const max = Number(row.maxdice)
      map.set(pk, {
        text: toLower(row.text_src),
        global: toLower(row.global_text_src),
        name: toLower(row.name, true),
        subname: toLower(row.subname, true),
        maxDice: Number.isFinite(max) && max > 0 ? max : TEAM_MAX_DICE
      })
    }
    return map
  }, [ready, contentDb, tryRun])

  const proxyDiceCards = useMemo<ProxyDiceEntry[]>(() => {
    if (!ready || !contentDb || !hasTable(contentDb, 'card_rows') || !hasTable(contentDb, 'cards')) return []
    const result = tryRun(contentDb, `
      SELECT
        r.card_pk,
        r.character_name,
        r.set_group,
        r.set_label,
        c.dice_faces,
        r.card_name
      FROM card_rows r
      JOIN cards c ON c.card_pk = r.card_pk
      WHERE c.dice_faces IS NOT NULL
        AND TRIM(c.dice_faces) <> ''
    `)
    if (!result.ok) return []
    const formatDice = (raw: unknown) => {
      if (raw == null) return { key: '', display: '' }
      const digits = String(raw).replace(/\D+/g, '')
      if (!digits) return { key: '', display: '' }
      const display = digits.match(/.{1,3}/g)?.join(' ') ?? digits
      return { key: digits, display }
    }
    const entries: ProxyDiceEntry[] = []
    const seen = new Set<string>()
    for (const row of result.rows as any[]) {
      const { key, display } = formatDice(row.dice_faces)
      if (!key) continue
      const character = typeof row.character_name === 'string' ? row.character_name : ''
      const rawSetCode = typeof row.set_group === 'string' ? row.set_group : ''
      const setCodeRaw = rawSetCode ? rawSetCode.toUpperCase() : (typeof row.set_label === 'string' ? row.set_label : '')
      const setCode = setCodeRaw || null
      const dedupeKey = `${key}||${character.toLowerCase()}||${setCode ?? ''}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const searchText = [character, setCode, display].filter(Boolean).join(' ').toLowerCase()
      entries.push({
        card_pk: Number(row.card_pk),
        character,
        setCode,
        diceKey: key,
        diceDisplay: display,
        searchText
      })
    }
    entries.sort((a, b) => {
      const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
      if (charCmp !== 0) return charCmp
      const setCmp = (a.setCode || '').localeCompare(b.setCode || '', undefined, { sensitivity: 'base' })
      if (setCmp !== 0) return setCmp
      return a.diceKey.localeCompare(b.diceKey)
    })
    return entries
  }, [ready, contentDb, tryRun])

  // ---------- Query cards (from materialized card_rows; filter client-side) ----------
  const allRows: CardRow[] = useMemo(() => {
    if (!ready || !contentDb || !hasTable(contentDb, 'card_rows')) return []
    const baseColumns = [
      'card_pk', 'set_id', 'set_label', 'set_group', 'universe',
      'card_number', 'character_name', 'card_name', 'cost',
      'energy_code', 'energy_tokens', 'type_name', 'rarity',
      'rarity_rank', 'gender', 'aff_tokens', 'align_tokens', 'has_errata', 'has_foil'
    ]
    const selectCols = baseColumns.join(',')
    const result = tryRun(contentDb, `
      SELECT ${selectCols}
      FROM card_rows
      ORDER BY character_name COLLATE NOCASE, rarity_rank, card_number
      LIMIT 6000
    `)
    if (!result.ok) return []
    return result.rows as CardRow[]
  }, [ready, contentDb, tryRun])

  const diceKey = useCallback((character: string, groupLabel: string) => `${character}||${groupLabel}`, [])

  const collectionSnapshot = useMemo(() => {
    const cardCounts = new Map<number, number>()
    const foilCounts = new Map<number, number>()
    const diceCounts = new Map<string, number>()
    if (!ready) {
      return { cardCounts, foilCounts, diceCounts }
    }

    const normalizeCount = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
      if (value == null) return 0
      const num = Number(value)
      return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0
    }

    try {
      const cardRows = runUser(
        `SELECT card_pk, have_cards, have_foil FROM collection`
      ) as Array<{ card_pk?: number | null; have_cards?: number | null; have_foil?: number | null }>
      for (const row of cardRows) {
        const cardPk = Number(row.card_pk ?? 0)
        if (!Number.isInteger(cardPk) || cardPk <= 0) continue
        cardCounts.set(cardPk, normalizeCount(row.have_cards))
        foilCounts.set(cardPk, normalizeCount(row.have_foil))
      }

      const diceRows = runUser(
        `SELECT character_name, set_group, dice_count FROM collection_dice`
      ) as Array<{ character_name?: string | null; set_group?: string | null; dice_count?: number | null }>

      for (const row of diceRows) {
        const character = typeof row.character_name === 'string' ? row.character_name.trim() : ''
        if (!character) continue
        const rawGroup = typeof row.set_group === 'string' ? row.set_group.trim() : ''
        const groupLabel = rawGroup || 'Other'
        const key = diceKey(character, groupLabel)
        diceCounts.set(key, normalizeCount(row.dice_count))
      }
    } catch (err) {
      console.warn('Failed to build collection snapshot', err)
    }

    return { cardCounts, foilCounts, diceCounts }
  }, [ready, runUser, collectionVersion, diceKey])

  const haveCards = useCallback((card_pk: number) => collectionSnapshot.cardCounts.get(card_pk) ?? 0, [collectionSnapshot])
  const haveFoil = useCallback((card_pk: number) => collectionSnapshot.foilCounts.get(card_pk) ?? 0, [collectionSnapshot])
  const diceGet = useCallback((character: string, groupLabel: string) => {
    if (!character) return 0
    const key = diceKey(character, groupLabel)
    return collectionSnapshot.diceCounts.get(key) ?? 0
  }, [collectionSnapshot, diceKey])

  const incCards = (card_pk: number, delta: number) => {
    const current = haveCards(card_pk)
    const next = Math.max(0, current + delta)
    if (next === current) return
    try {
      runUser(
        `INSERT INTO collection(card_pk, have_cards)
           VALUES(?, ?)
         ON CONFLICT(card_pk) DO UPDATE SET have_cards = excluded.have_cards`,
        [card_pk, next]
      )
      bumpCollection()
    } catch (e) { console.warn('update failed', e) }
  }

  const incFoil = (card_pk: number, delta: number) => {
    const current = haveFoil(card_pk)
    const next = Math.max(0, current + delta)
    if (next === current) return
    try {
      runUser(
        `INSERT INTO collection(card_pk, have_foil)
           VALUES(?, ?)
         ON CONFLICT(card_pk) DO UPDATE SET have_foil = excluded.have_foil`,
        [card_pk, next]
      )
      bumpCollection()
    } catch (e) { console.warn('update failed', e) }
  }

  const diceInc = (character: string, groupLabel: string, delta: number) => {
    const current = diceGet(character, groupLabel)
    const next = Math.max(0, current + delta)
    if (next === current) return
    try {
      runUser(
        `INSERT INTO collection_dice(character_name, set_group, dice_count)
           VALUES(?, ?, ?)
         ON CONFLICT(character_name, set_group) DO UPDATE SET dice_count = excluded.dice_count`,
        [character, groupLabel, next]
      )
      bumpCollection()
    } catch (e) { console.warn('dice update failed', e) }
  }

  const energyTokensByPk = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const row of allRows) {
      map.set(row.card_pk, parseEnergyTokens(row.energy_tokens))
    }
    return map
  }, [allRows])

  const alignTokensByPk = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const row of allRows) {
      const tokens = (row.align_tokens || '')
        .split(',')
        .map((s) => s.trim())
        .filter(nonEmpty)
      map.set(row.card_pk, tokens)
    }
    return map
  }, [allRows])

  const affTokensExpandedByPk = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (const row of allRows) {
      const rawTokens = (row.aff_tokens || '')
        .split(',')
        .map((s) => s.trim())
        .filter(nonEmpty)
      const expanded = new Set<string>()
      for (const token of rawTokens) {
        const expansion = affExpansion.get(token)
        if (expansion) {
          expansion.forEach((value) => expanded.add(value))
        } else {
          expanded.add(token)
        }
      }
      map.set(row.card_pk, expanded)
    }
    return map
  }, [allRows, affExpansion])

  const affSelectionTokens = useMemo(() => {
    if (!affSel.length) return null
    const set = new Set<string>()
    for (const token of affSel) {
      const expansion = affExpansion.get(token)
      if (expansion) {
        expansion.forEach((value) => set.add(value))
      } else {
        set.add(token)
      }
    }
    return set
  }, [affSel, affExpansion])

  const selectedGroupSet = useMemo(() => (selectedGroups.length ? new Set(selectedGroups) : null), [selectedGroups])
  const energySelSet = useMemo(() => (energySel.length ? new Set(energySel) : null), [energySel])
  const universeSelSet = useMemo(() => (universeSel.length ? new Set(universeSel) : null), [universeSel])
  const raritySelSet = useMemo(() => (raritySel.length ? new Set(raritySel) : null), [raritySel])
  const alignSelSet = useMemo(() => (alignSel.length ? new Set(alignSel) : null), [alignSel])
  const costSelSet = useMemo(() => (costSel.length ? new Set(costSel) : null), [costSel])
  const typeSelSet = useMemo(() => (typeSel.length ? new Set(typeSel) : null), [typeSel])
  const genderSelSet = useMemo(() => (genderSel.length ? new Set(genderSel) : null), [genderSel])

  const filteredRows: CardRow[] = useMemo(() => {
    if (!allRows.length) return []
    const term = deferredQuery.trim().toLowerCase()
    const hasQuery = term.length > 0
    const normalizedTerm = hasQuery ? normalizeSearchValue(term) : ''
    const hasNormalizedTerm = normalizedTerm.length > 0
    const matchesTerm = (value: unknown) => {
      if (!hasQuery || value == null) return false
      const lower = String(value).toLowerCase()
      if (lower.includes(term)) return true
      if (!hasNormalizedTerm) return false
      const normalized = normalizeSearchValue(value)
      if (!normalized) return false
      return normalized.includes(normalizedTerm)
    }

    return allRows.filter((r) => {
      if (hasQuery) {
        const meta = cardSearchMap.get(r.card_pk)
        if (searchMode === 'global') {
          if (!matchesTerm(meta?.global)) return false
        } else if (searchMode === 'text') {
          if (!matchesTerm(meta?.text)) return false
        } else {
          const charCandidates: string[] = []
          if (typeof r.character_name === 'string') {
            const value = r.character_name.trim().toLowerCase()
            if (value) charCandidates.push(value)
          }
          if (meta?.name) charCandidates.push(meta.name)

          const cardNameCandidates: string[] = []
          if (typeof r.card_name === 'string') {
            const value = String(r.card_name).trim().toLowerCase()
            if (value) cardNameCandidates.push(value)
          }
          if (meta?.subname) cardNameCandidates.push(meta.subname)

          const charMatch = charCandidates.some((value) => matchesTerm(value))
          const cardMatch = cardNameCandidates.some((value) => matchesTerm(value))

          if (!(charMatch || cardMatch)) return false
        }
      }

      if (selectedGroupSet && selectedGroupSet.size) {
        const label = r.set_group ?? 'Other'
        if (!selectedGroupSet.has(label)) return false
      }

      if (formatSel != null) {
        const bans = formatBans.get(formatSel)
        if (bans) {
          if (bans.sets.has(r.set_id)) return false
          if (bans.cards.has(r.card_pk)) return false
        }
      }

      if (energySelSet && energySelSet.size) {
        const tokens = energyTokensByPk.get(r.card_pk) ?? []
        let match = false
        for (const tok of tokens) {
          if (energySelSet.has(tok)) {
            match = true
            break
          }
        }
        if (!match) return false
      }

      if (universeSelSet && universeSelSet.size) {
        if (!r.universe || !universeSelSet.has(r.universe)) return false
      }

      if (raritySelSet && raritySelSet.size) {
        if (!r.rarity || !raritySelSet.has(r.rarity)) return false
      }

      if (ownedYes !== ownedNo) {
        const own = haveCards(r.card_pk) > 0 || haveFoil(r.card_pk) > 0
        if (ownedYes && !own) return false
        if (ownedNo && own) return false
      }

      if (affSelectionTokens && affSelectionTokens.size) {
        const cardTokens = affTokensExpandedByPk.get(r.card_pk)
        if (!cardTokens || !cardTokens.size) return false
        let match = false
        for (const token of affSelectionTokens) {
          if (cardTokens.has(token)) {
            match = true
            break
          }
        }
        if (!match) return false
      }

      if (alignSelSet && alignSelSet.size) {
        const tokens = alignTokensByPk.get(r.card_pk) ?? []
        let match = false
        for (const tok of tokens) {
          if (alignSelSet.has(tok)) {
            match = true
            break
          }
        }
        if (!match) return false
      }

      if (costSelSet && costSelSet.size) {
        if (typeof r.cost !== 'number' || !costSelSet.has(r.cost)) return false
      }

      if (typeSelSet && typeSelSet.size) {
        if (!r.type_name || !typeSelSet.has(r.type_name)) return false
      }

      if (genderSelSet && genderSelSet.size) {
        const gl = genderLabel(r.gender)
        if (!gl || !genderSelSet.has(gl)) return false
      }

      return true
    })
  }, [
    allRows,
    deferredQuery,
    searchMode,
    cardSearchMap,
    selectedGroupSet,
    formatSel,
    formatBans,
    energySelSet,
    energyTokensByPk,
    universeSelSet,
    raritySelSet,
    ownedYes,
    ownedNo,
    haveCards,
    haveFoil,
    affSelectionTokens,
    affTokensExpandedByPk,
    alignSelSet,
    alignTokensByPk,
    costSelSet,
    typeSelSet,
    genderSelSet
  ])

  // ---------- Grouping (BA first; characters by set_group) ----------
  const groups = useMemo(() => {
    type Group = { title: string; key: string; isBA: boolean; items: CardRow[]; character: string; groupLabel: string }
    const byKey = new Map<string, Group>()
    const labelFor = (r: CardRow) => (r.set_group ?? r.set_label ?? '')

    for (const r of filteredRows) {
      const isBA = isBasic(r.type_name || '')
      const title = isBA ? `Basic Action (${labelFor(r)})` : `${r.character_name} (${labelFor(r)})`
      const key = (isBA ? 'BAC' : 'CHAR') + '||' + labelFor(r) + '||' + (isBA ? 'BAC' : r.character_name)
      if (!byKey.has(key)) byKey.set(key, { title, key, isBA, items: [], character: r.character_name, groupLabel: labelFor(r) })
      byKey.get(key)!.items.push(r)
    }

    // order within group: rarity_rank asc (0 first) then card_number
    for (const g of byKey.values()) {
      g.items.sort((a, b) => {
        const ra = a.rarity_rank ?? 9999
        const rb = b.rarity_rank ?? 9999
        if (ra !== rb) return ra - rb
        const an = String(a.card_number ?? '')
        const bn = String(b.card_number ?? '')
        return an.localeCompare(bn, undefined, { numeric: true })
      })
    }

    // order groups: BAC first, then alpha by title
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.isBA !== b.isBA) return a.isBA ? -1 : 1
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })
  }, [filteredRows])

  const groupKeys = useMemo(() => groups.map(g => g.key), [groups])
  const visibleCards = useMemo(() => groups.flatMap(g => g.items), [groups])
  const cardMetaByPk = useMemo(() => {
    const map = new Map<number, CardRow>()
    for (const row of allRows) map.set(row.card_pk, row)
    return map
  }, [allRows])

  const cardRepByDiceKey = useMemo(() => {
    const map = new Map<string, CardRow>()
    cardMetaByPk.forEach((row) => {
      const character = row.character_name || ''
      if (!character) return
      const groupLabel = row.set_group ?? row.set_label ?? 'Other'
      const key = diceKey(character, groupLabel)
      if (!map.has(key)) {
        map.set(key, row)
      }
    })
    return map
  }, [cardMetaByPk])

  const handleExportCollection = useCallback(async () => {
    if (!ready || !contentDb) return
    const header = ['Set', 'Character', 'Card Name', 'Cards Owned', 'Foils Owned', 'Dice Owned']
    const rows: string[][] = []

    const collectionRows = runUser(`SELECT card_pk, have_cards, have_foil FROM collection`)
    const diceRows = runUser(`SELECT character_name, set_group, dice_count FROM collection_dice`)

    const diceMap = new Map<string, number>()
    for (const row of diceRows as any[]) {
      const character = typeof row.character_name === 'string' ? row.character_name.trim() : ''
      const group = typeof row.set_group === 'string' && row.set_group ? row.set_group : 'Other'
      const count = Number(row.dice_count ?? 0)
      if (!character || count <= 0) continue
      diceMap.set(diceKey(character, group), count)
    }

    const diceUsed = new Set<string>()

    const tzStmt = contentDb.prepare(`
      SELECT tz_set, tz_character, tz_card_name
      FROM tz_card_map
      WHERE card_pk = ?
      LIMIT 1
    `)

    const formatCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`

    const appendRow = (setVal: string, characterVal: string, cardNameVal: string, cardsOwned: number, foilsOwned: number, diceOwned: number | '') => {
      const line = [setVal, characterVal, cardNameVal, String(cardsOwned), String(foilsOwned), diceOwned === '' ? '' : String(diceOwned)]
      rows.push(line)
    }

    const collectionMap = new Map<number, { cards: number; foils: number }>()
    for (const row of collectionRows as any[]) {
      const cardPk = Number(row.card_pk ?? 0)
      if (!Number.isInteger(cardPk) || cardPk <= 0) continue
      const cardsOwned = Number.isFinite(row.have_cards) ? Math.max(0, Number(row.have_cards ?? 0)) : 0
      const foilsOwned = Number.isFinite(row.have_foil) ? Math.max(0, Number(row.have_foil ?? 0)) : 0
      collectionMap.set(cardPk, { cards: cardsOwned, foils: foilsOwned })
    }

    const sortedCards = Array.from(cardMetaByPk.entries())
      .map(([card_pk, meta]) => ({ card_pk, meta }))
      .sort((a, b) => {
        const metaA = a.meta
        const metaB = b.meta
        const setA = (metaA?.set_group ?? metaA?.set_label ?? '').toLowerCase()
        const setB = (metaB?.set_group ?? metaB?.set_label ?? '').toLowerCase()
        if (setA !== setB) return setA.localeCompare(setB)
        const charA = (metaA?.character_name ?? '').toLowerCase()
        const charB = (metaB?.character_name ?? '').toLowerCase()
        if (charA !== charB) return charA.localeCompare(charB)
        const nameA = (metaA?.card_name ?? '').toLowerCase()
        const nameB = (metaB?.card_name ?? '').toLowerCase()
        return nameA.localeCompare(nameB)
      })

    try {
      for (const entry of sortedCards) {
        const { card_pk, meta } = entry
        if (!meta) continue

        let tzSet = ''
        let tzCharacter = ''
        let tzCardName = ''

        tzStmt.bind([card_pk])
        if (tzStmt.step()) {
          const data = tzStmt.getAsObject() as any
          tzSet = data.tz_set ? String(data.tz_set) : ''
          tzCharacter = data.tz_character ? String(data.tz_character) : ''
          tzCardName = data.tz_card_name ? String(data.tz_card_name) : ''
        }
        tzStmt.reset()

        const characterName = meta.character_name ?? ''
        const groupLabel = meta.set_group ?? meta.set_label ?? 'Other'
        const diceKeyValue = diceKey(characterName, groupLabel)
        let diceOwned: number | '' = ''
        const diceCount = diceMap.get(diceKeyValue)
        if (diceCount != null && diceCount > 0 && !diceUsed.has(diceKeyValue)) {
          diceOwned = diceCount
          diceUsed.add(diceKeyValue)
        }

        if (!tzSet) tzSet = meta.set_group ?? meta.set_label ?? ''
        if (!tzCharacter) tzCharacter = characterName
        if (!tzCardName) tzCardName = meta.card_name ?? characterName

        const counts = collectionMap.get(card_pk)
        const cardsOwned = counts ? counts.cards : 0
        const foilsOwned = counts ? counts.foils : 0

        appendRow(tzSet, tzCharacter, tzCardName, cardsOwned, foilsOwned, diceOwned)
      }
    } finally {
      tzStmt.free()
    }

    const leftovers: Array<{ key: string; count: number }> = []
    diceMap.forEach((count, key) => {
      if (count > 0 && !diceUsed.has(key)) leftovers.push({ key, count })
    })

    for (const { key, count } of leftovers) {
      const rep = cardRepByDiceKey.get(key)
      if (!rep) continue
      const meta = rep
      const [characterName] = key.split('||')

      let tzSet = ''
      let tzCharacter = ''
      let tzCardName = ''

      const stmt = contentDb.prepare(
        `SELECT tz_set, tz_character, tz_card_name FROM tz_card_map WHERE card_pk = ? LIMIT 1`
      )
      try {
        stmt.bind([meta.card_pk])
        if (stmt.step()) {
          const data = stmt.getAsObject() as any
          tzSet = data.tz_set ? String(data.tz_set) : ''
          tzCharacter = data.tz_character ? String(data.tz_character) : ''
          tzCardName = data.tz_card_name ? String(data.tz_card_name) : ''
        }
      } finally {
        stmt.free()
      }

      if (!tzSet) tzSet = meta.set_group ?? meta.set_label ?? ''
      if (!tzCharacter) tzCharacter = characterName
      if (!tzCardName) tzCardName = meta.card_name ?? characterName

      appendRow(tzSet, tzCharacter, tzCardName, 0, 0, count)
    }

    if (!rows.length) {
      rows.push(['', '', '', '0', '0', ''])
    }

    const csvLines = [header, ...rows].map(line => line.map(value => formatCsvValue(String(value ?? ''))).join(','))
    const csvText = csvLines.join('\r\n')
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-').replace('Z', '')
    const filename = `collection-export-${timestamp}.csv`

    if (nativeEnv) {
      const encoder = new TextEncoder()
      const bytes = encoder.encode(csvText)
      try {
        await saveDocumentWithDialog({
          filename,
          bytes,
          mimeType: 'text/csv'
        })
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert('Collection export saved.')
        }
      } catch (dialogErr) {
        console.warn('Save dialog failed, falling back to internal storage', dialogErr)
        try {
          const result = await saveNativeBinaryFile({
            filename,
            bytes,
            directory: Directory.Documents,
            relativeDir: ['Prep Area', 'Exports']
          })
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`Collection export saved to ${result.displayPath}.`)
          }
        } catch (err) {
          console.error('Failed to save native collection export', err)
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('Failed to save collection export on this device.')
          }
        }
      }
      return
    }

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }, [ready, contentDb, runUser, cardMetaByPk, cardRepByDiceKey, nativeEnv])

  const teams = useMemo<Team[]>(() => {
    if (!ready) return []
    const rows = runUser(
      `SELECT team_id, name, created_at, updated_at
       FROM teams
       ORDER BY COALESCE(created_at, ''), team_id`
    ) as Array<{ team_id?: number; name?: string; created_at?: string | null; updated_at?: string | null }>
    return rows.map((row) => ({
      team_id: Number(row.team_id ?? 0),
      name: nonEmpty(row.name) ? String(row.name) : 'Untitled Team',
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null
    }))
  }, [ready, runUser, teamsVersion])

  const teamCardsMap = useMemo(() => {
    const map = new Map<number, TeamCard[]>()
    if (!ready) return map
    const rows = runUser(
      `SELECT team_id, card_pk, dice_count FROM team_cards`
    ) as Array<{ team_id?: number; card_pk?: number; dice_count?: number }>
    for (const row of rows) {
      const teamId = Number(row.team_id ?? 0)
      const cardPk = Number(row.card_pk ?? 0)
      if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(cardPk) || cardPk <= 0) continue
      const diceCount = Math.max(0, Number(row.dice_count ?? 0))
      if (!map.has(teamId)) map.set(teamId, [])
      map.get(teamId)!.push({ team_id: teamId, card_pk: cardPk, dice_count: diceCount })
    }
    return map
  }, [ready, runUser, teamsVersion])

  const teamDiceTotals = useMemo(() => {
    const totals = new Map<number, number>()
    teamCardsMap.forEach((entries, teamId) => {
      const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.dice_count ?? 0), 0)
      totals.set(teamId, total)
    })
    return totals
  }, [teamCardsMap])

  useEffect(() => {
    setSelectedTeamId((prev) => {
      if (!teams.length) return null
      if (prev != null && teams.some(t => t.team_id === prev)) return prev
      return teams[0].team_id
    })
  }, [teams])

  useEffect(() => {
    if (selectedTeamId == null && teamView !== 'list') {
      setTeamView('list')
    }
  }, [selectedTeamId, teamView])

  useEffect(() => {
    if (!teams.length && teamView !== 'list') {
      setTeamView('list')
    }
  }, [teams.length, teamView])

  useEffect(() => {
    if (page !== 'Teams' && teamView !== 'list') {
      setTeamView('list')
    }
  }, [page, teamView])

  const getCardMaxDice = useCallback((cardPk: number) => {
    const meta = cardSearchMap.get(cardPk)
    return meta?.maxDice ?? TEAM_MAX_DICE
  }, [cardSearchMap])

  const tradeSnapshot = useMemo<TradeSnapshot | null>(() => {
    if (!ready) return null

    const cardCounts = new Map<number, { standard: number; foil: number }>()
    collectionSnapshot.cardCounts.forEach((standard, cardPk) => {
      const foil = collectionSnapshot.foilCounts.get(cardPk) ?? 0
      cardCounts.set(cardPk, { standard, foil })
    })
    collectionSnapshot.foilCounts.forEach((foil, cardPk) => {
      if (!cardCounts.has(cardPk)) {
        cardCounts.set(cardPk, { standard: 0, foil })
      }
    })

    const diceCountByKey = new Map<string, number>()
    collectionSnapshot.diceCounts.forEach((count, key) => {
      diceCountByKey.set(key, count)
    })

    const cardDetailMap = new Map<number, TradeSnapshotCardDetail>()
    const diceRequirementMap = new Map<string, { required: number; character: string; groupLabel: string; set: string }>()
    const diceRepresentatives = new Map<string, { cardPk: number | null; maxDice: number }>()
    const diceEntries: TradeSnapshotDiceEntry[] = []
    const diceEntryByKey = new Map<string, TradeSnapshotDiceEntry>()

    cardMetaByPk.forEach((row, cardPk) => {
      const character = row.character_name ?? ''
      if (!character) return
      const { groupLabel, setDisplay } = getTradeSetInfo(row)
      const key = diceKey(character, groupLabel)
      const maxDice = getCardMaxDice(cardPk)
      const existingReq = diceRequirementMap.get(key)
      if (!existingReq || maxDice > existingReq.required) {
        diceRequirementMap.set(key, { required: maxDice, character, groupLabel, set: setDisplay })
      }
      const currentRep = diceRepresentatives.get(key)
      if (!currentRep || maxDice > currentRep.maxDice) {
        diceRepresentatives.set(key, { cardPk, maxDice })
      } else if (maxDice === currentRep.maxDice) {
        const repRow = currentRep.cardPk != null ? cardMetaByPk.get(currentRep.cardPk) : null
        const repName = (repRow?.card_name ?? '').toLowerCase()
        const currName = (row.card_name ?? '').toLowerCase()
        if (currName && (!repName || currName.localeCompare(repName, undefined, { sensitivity: 'base' }) < 0)) {
          diceRepresentatives.set(key, { cardPk, maxDice })
        }
      }

      const counts = cardCounts.get(cardPk) ?? { standard: 0, foil: 0 }
      const standardOwned = Math.max(0, counts.standard)
      const foilOwned = Math.max(0, counts.foil)
      const totalOwned = standardOwned + foilOwned
      const hasFoil = !!row.has_foil
      const cardName = row.card_name ?? ''
      const baseNeedStandard = Math.max(0, 1 - standardOwned)
      const baseNeedFoil = hasFoil ? Math.max(0, 1 - foilOwned) : 0
      const detail: TradeSnapshotCardDetail = {
        cardPk,
        set: setDisplay,
        groupLabel,
        character,
        cardName,
        cardType: row.type_name ?? null,
        cost: typeof row.cost === 'number' ? row.cost : null,
        standardOwned,
        foilOwned,
        spareStandard: 0,
        spareFoil: 0,
        needStandard: 0,
        needFoil: 0,
        needAny: 0,
        preferFoil: false,
        hasFoil,
        diceKey: key
      }

      if (tradeKeepBoth) {
        const desiredStandard = 1
        const desiredFoil = hasFoil ? 1 : 0
        detail.needStandard = baseNeedStandard
        detail.needFoil = baseNeedFoil
        detail.spareStandard = Math.max(0, standardOwned - desiredStandard)
        detail.spareFoil = Math.max(0, foilOwned - desiredFoil)
      } else {
        const desiredAny = 1
        detail.needAny = totalOwned < desiredAny ? desiredAny - totalOwned : 0
        detail.needStandard = hasFoil ? 0 : baseNeedStandard
        detail.needFoil = baseNeedFoil
        if (!hasFoil) {
          detail.needAny = 0
        }
        if (foilOwned > 0) {
          const keepFoil = Math.min(foilOwned, desiredAny)
          detail.spareFoil = Math.max(0, foilOwned - keepFoil)
          const remainingNeed = Math.max(0, desiredAny - keepFoil)
          const keepStandard = Math.min(standardOwned, remainingNeed)
          detail.spareStandard = Math.max(0, standardOwned - keepStandard)
        } else {
          const keepStandard = Math.min(standardOwned, desiredAny)
          detail.spareStandard = Math.max(0, standardOwned - keepStandard)
          detail.spareFoil = 0
        }
        detail.preferFoil = hasFoil && detail.needAny > 0
      }

      cardDetailMap.set(cardPk, detail)
    })

    diceCountByKey.forEach((count, key) => {
      if (!diceRequirementMap.has(key)) {
        const [character = '', groupLabel = ''] = key.split('||')
        const fallbackSet = groupLabel || 'Other'
        diceRequirementMap.set(key, {
          required: 0,
          character,
          groupLabel: fallbackSet,
          set: fallbackSet
        })
        if (!diceRepresentatives.has(key)) {
          diceRepresentatives.set(key, { cardPk: null, maxDice: 0 })
        }
      }
    })

    diceRequirementMap.forEach((info, key) => {
      const owned = Math.max(0, diceCountByKey.get(key) ?? 0)
      const required = Math.max(0, info.required)
      const spare = Math.max(0, owned - required)
      const need = required > owned ? required - owned : 0
      const rep = diceRepresentatives.get(key)
      const entry: TradeSnapshotDiceEntry = {
        key,
        character: info.character,
        set: info.set,
        groupLabel: info.groupLabel,
        required,
        owned,
        spare,
        need,
        repCardPk: rep ? rep.cardPk : null
      }
      diceEntries.push(entry)
      diceEntryByKey.set(key, entry)
    })

    diceEntries.sort((a, b) => {
      const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
      if (charCmp !== 0) return charCmp
      return a.set.localeCompare(b.set, undefined, { sensitivity: 'base' })
    })

    const diceNeedMap = new Map<string, TradeSnapshotDiceEntry>()
    const diceSpareMap = new Map<string, TradeSnapshotDiceEntry>()
    const diceByCardPk = new Map<number, TradeSnapshotDiceEntry>()
    for (const entry of diceEntries) {
      if (entry.need > 0) diceNeedMap.set(entry.key, entry)
      if (entry.spare > 0) diceSpareMap.set(entry.key, entry)
      if (entry.repCardPk != null) diceByCardPk.set(entry.repCardPk, entry)
    }

    cardDetailMap.forEach((detail) => {
      const diceEntry = diceEntryByKey.get(detail.diceKey)
      if (!diceEntry) return
      detail.dice = {
        owned: diceEntry.owned,
        required: diceEntry.required,
        spare: diceEntry.spare,
        need: diceEntry.need
      }
    })

    return { cardDetailMap, diceEntries, diceNeedMap, diceSpareMap, diceByCardPk }
  }, [ready, collectionSnapshot, cardMetaByPk, tradeKeepBoth, getCardMaxDice, getTradeSetInfo, diceKey])

  const tradeResult = useMemo<TradeCompareResult | null>(() => {
    if (!tradeSnapshot) return null

    const partnerCards = tradePartnerData?.cards ?? new Map<number, TradePartnerCardInfo>()
    const partnerDice = tradePartnerData?.dice ?? new Map<string, TradePartnerDiceInfo>()
    const unmatched = tradePartnerData?.unmatched ?? []
    const partnerTotals = tradePartnerData?.totals ?? {
      spareStandard: 0,
      spareFoil: 0,
      spareDice: 0,
      needStandard: 0,
      needFoil: 0,
      needAny: 0,
      needDice: 0,
      rows: 0
    }

    const entries: TradeListEntry[] = []
    const diceOnlyKeys = new Set<string>()
    const summary = {
      total: 0,
      spares: 0,
      missing: 0,
      tradePlus: 0,
      tradeMinus: 0
    }

    tradeSnapshot.cardDetailMap.forEach((detail) => {
      const partnerInfo = partnerCards.get(detail.cardPk)
      const partnerSpareStandard = partnerInfo?.spareStandard ?? 0
      const partnerSpareFoil = partnerInfo?.spareFoil ?? 0
      const partnerNeedStandard = partnerInfo?.needStandard ?? 0
      const partnerNeedFoil = partnerInfo?.needFoil ?? 0
      const partnerNeedAny = partnerInfo?.needAny ?? 0

      let availablePartnerStandard = partnerSpareStandard
      let availablePartnerFoil = partnerSpareFoil
      let tradePlusStandard = 0
      let tradePlusFoil = 0

      if (tradeKeepBoth) {
        if (detail.needStandard > 0 && availablePartnerStandard > 0) {
          const taken = Math.min(detail.needStandard, availablePartnerStandard)
          tradePlusStandard += taken
          availablePartnerStandard -= taken
        }
        if (detail.needFoil > 0 && availablePartnerFoil > 0) {
          const taken = Math.min(detail.needFoil, availablePartnerFoil)
          tradePlusFoil += taken
          availablePartnerFoil -= taken
        }
      } else {
        if (detail.needStandard > 0 && availablePartnerStandard > 0) {
          const taken = Math.min(detail.needStandard, availablePartnerStandard)
          tradePlusStandard += taken
          availablePartnerStandard -= taken
        }

        let anyRemaining = detail.needAny
        if (anyRemaining > 0 && detail.preferFoil && availablePartnerFoil > 0) {
          const takenFoil = Math.min(availablePartnerFoil, anyRemaining)
          tradePlusFoil += takenFoil
          availablePartnerFoil -= takenFoil
          anyRemaining -= takenFoil
        }
        if (anyRemaining > 0 && availablePartnerStandard > 0) {
          const takenStandard = Math.min(availablePartnerStandard, anyRemaining)
          tradePlusStandard += takenStandard
          availablePartnerStandard -= takenStandard
          anyRemaining -= takenStandard
        }
        if (anyRemaining > 0 && availablePartnerFoil > 0) {
          const takenFoil = Math.min(availablePartnerFoil, anyRemaining)
          tradePlusFoil += takenFoil
          availablePartnerFoil -= takenFoil
          anyRemaining -= takenFoil
        }

        const foilRemaining = Math.max(0, detail.needFoil - tradePlusFoil)
        if (foilRemaining > 0 && availablePartnerFoil > 0) {
          const taken = Math.min(availablePartnerFoil, foilRemaining)
          tradePlusFoil += taken
          availablePartnerFoil -= taken
        }
      }

      let tradeMinusStandard = 0
      let tradeMinusFoil = 0
      let availableStandard = detail.spareStandard
      let availableFoil = detail.spareFoil

      if (partnerNeedStandard > 0 && availableStandard > 0) {
        const taken = Math.min(availableStandard, partnerNeedStandard)
        tradeMinusStandard += taken
        availableStandard -= taken
      }
      if (partnerNeedFoil > 0 && availableFoil > 0) {
        const taken = Math.min(availableFoil, partnerNeedFoil)
        tradeMinusFoil += taken
        availableFoil -= taken
      }
      if (partnerNeedAny > 0) {
        let remainingAny = partnerNeedAny
        if (remainingAny > 0 && availableFoil > 0) {
          const takenFoil = Math.min(availableFoil, remainingAny)
          tradeMinusFoil += takenFoil
          availableFoil -= takenFoil
          remainingAny -= takenFoil
        }
        if (remainingAny > 0 && availableStandard > 0) {
          const takenStandard = Math.min(availableStandard, remainingAny)
          tradeMinusStandard += takenStandard
          availableStandard -= takenStandard
          remainingAny -= takenStandard
        }
      }

      const diceEntry = detail.dice
      const partnerDiceInfo = partnerDice.get(detail.diceKey)
      const tradePlusDice = diceEntry ? Math.min(diceEntry.need, partnerDiceInfo?.spare ?? 0) : 0
      const tradeMinusDice = diceEntry ? Math.min(diceEntry.spare, partnerDiceInfo?.need ?? 0) : 0

      const spareFlag = detail.spareStandard > 0 || detail.spareFoil > 0 || (diceEntry?.spare ?? 0) > 0
      const missingFlag = detail.needStandard > 0 || detail.needFoil > 0 || detail.needAny > 0 || (diceEntry?.need ?? 0) > 0
      const tradePlusFlag = tradePlusStandard > 0 || tradePlusFoil > 0 || tradePlusDice > 0
      const tradeMinusFlag = tradeMinusStandard > 0 || tradeMinusFoil > 0 || tradeMinusDice > 0
      const diceFlag = !!diceEntry

      if (!(spareFlag || missingFlag || tradePlusFlag || tradeMinusFlag)) {
        return
      }

      const hasCardSpecific =
        detail.spareStandard > 0 ||
        detail.spareFoil > 0 ||
        detail.needStandard > 0 ||
        detail.needFoil > 0 ||
        detail.needAny > 0 ||
        tradePlusStandard > 0 ||
        tradePlusFoil > 0 ||
        tradeMinusStandard > 0 ||
        tradeMinusFoil > 0

      if (!hasCardSpecific && diceFlag) {
        if (diceOnlyKeys.has(detail.diceKey)) {
          return
        }
        diceOnlyKeys.add(detail.diceKey)
      }

      const foilUpgradeForUs =
        detail.needFoil > 0 &&
        detail.needStandard <= 0 &&
        detail.needAny <= 0 &&
        (diceEntry?.need ?? 0) <= 0 &&
        (diceEntry?.spare ?? 0) <= 0 &&
        tradePlusFoil > 0 &&
        tradePlusStandard === 0 &&
        tradePlusDice === 0 &&
        tradeMinusStandard === 0 &&
        tradeMinusFoil === 0 &&
        tradeMinusDice === 0 &&
        partnerNeedStandard <= 0 &&
        partnerNeedFoil <= 0 &&
        partnerNeedAny <= 0 &&
        (partnerDiceInfo?.need ?? 0) <= 0

      const foilUpgradeForPartner =
        partnerNeedFoil > 0 &&
        partnerNeedStandard <= 0 &&
        partnerNeedAny <= 0 &&
        (partnerDiceInfo?.need ?? 0) <= 0 &&
        tradeMinusFoil > 0 &&
        tradeMinusStandard === 0 &&
        tradeMinusDice === 0 &&
        tradePlusStandard === 0 &&
        tradePlusFoil === 0 &&
        tradePlusDice === 0 &&
        detail.needStandard <= 0 &&
        detail.needAny <= 0 &&
        detail.needFoil <= 0 &&
        (diceEntry?.need ?? 0) <= 0 &&
        (diceEntry?.spare ?? 0) <= 0

      entries.push({
        id: `card-${detail.cardPk}`,
        kind: 'card',
        cardPk: detail.cardPk,
        character: detail.character,
        cardName: detail.cardName || 'Unnamed',
        set: detail.set,
        cardCost: detail.cost ?? null,
        cardType: detail.cardType ?? null,
        cost: detail.cost ?? null,
        spareStandard: detail.spareStandard,
        spareFoil: detail.spareFoil,
        needStandard: detail.needStandard,
        needFoil: detail.needFoil,
        needAny: detail.needAny,
        partnerSpareStandard,
        partnerSpareFoil,
        partnerNeedStandard,
        partnerNeedFoil,
        partnerNeedAny,
        tradePlusStandard,
        tradePlusFoil,
        tradePlusDice,
        tradeMinusStandard,
        tradeMinusFoil,
        tradeMinusDice,
        diceOwned: diceEntry?.owned ?? 0,
        diceRequired: diceEntry?.required ?? 0,
        diceSpare: diceEntry?.spare ?? 0,
        diceNeed: diceEntry?.need ?? 0,
        partnerDiceSpare: partnerDiceInfo?.spare ?? 0,
        partnerDiceNeed: partnerDiceInfo?.need ?? 0,
        preferFoil: detail.preferFoil,
        foilUpgradeForUs,
        foilUpgradeForPartner,
        flags: {
          spare: spareFlag,
          missing: missingFlag,
          tradePlus: tradePlusFlag,
          tradeMinus: tradeMinusFlag,
          dice: diceFlag
        }
      })

      summary.spares += spareFlag ? 1 : 0
      summary.missing += missingFlag ? 1 : 0
      summary.tradePlus += tradePlusFlag ? 1 : 0
      summary.tradeMinus += tradeMinusFlag ? 1 : 0
    })

    tradeSnapshot.diceEntries.forEach((entry) => {
      if (entry.repCardPk != null) return
      const partnerDiceInfo = partnerDice.get(entry.key)
      const tradePlusDice = Math.min(entry.need, partnerDiceInfo?.spare ?? 0)
      const tradeMinusDice = Math.min(entry.spare, partnerDiceInfo?.need ?? 0)
      const spareFlag = entry.spare > 0
      const missingFlag = entry.need > 0
      const tradePlusFlag = tradePlusDice > 0
      const tradeMinusFlag = tradeMinusDice > 0
      if (!(spareFlag || missingFlag || tradePlusFlag || tradeMinusFlag)) return
      entries.push({
        id: `dice-${entry.key}`,
        kind: 'dice',
        character: entry.character,
        cardName: 'Dice',
        set: entry.set,
        cardCost: null,
        cardType: null,
        cost: null,
        spareStandard: 0,
        spareFoil: 0,
        needStandard: 0,
        needFoil: 0,
        needAny: 0,
        partnerSpareStandard: 0,
        partnerSpareFoil: 0,
        partnerNeedStandard: 0,
        partnerNeedFoil: 0,
        partnerNeedAny: 0,
        tradePlusStandard: 0,
        tradePlusFoil: 0,
        tradePlusDice,
        tradeMinusStandard: 0,
        tradeMinusFoil: 0,
        tradeMinusDice,
        diceOwned: entry.owned,
        diceRequired: entry.required,
        diceSpare: entry.spare,
        diceNeed: entry.need,
        partnerDiceSpare: partnerDiceInfo?.spare ?? 0,
        partnerDiceNeed: partnerDiceInfo?.need ?? 0,
        preferFoil: false,
        foilUpgradeForUs: false,
        foilUpgradeForPartner: false,
        flags: {
          spare: spareFlag,
          missing: missingFlag,
          tradePlus: tradePlusFlag,
          tradeMinus: tradeMinusFlag,
          dice: true
        }
      })

      summary.spares += spareFlag ? 1 : 0
      summary.missing += missingFlag ? 1 : 0
      summary.tradePlus += tradePlusFlag ? 1 : 0
      summary.tradeMinus += tradeMinusFlag ? 1 : 0
    })

    entries.sort((a, b) => {
      const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
      if (charCmp !== 0) return charCmp
      const setCmp = a.set.localeCompare(b.set, undefined, { sensitivity: 'base' })
      if (setCmp !== 0) return setCmp
      return (a.cardName || '').localeCompare(b.cardName || '', undefined, { sensitivity: 'base' })
    })

    summary.total = entries.length

    return {
      entries,
      summary,
      unmatched,
      partnerTotals
    }
  }, [tradeSnapshot, tradePartnerData, tradeKeepBoth])

  const getCardOwnershipKey = useCallback((cardPk: number) => {
    const meta = cardMetaByPk.get(cardPk)
    if (!meta) return { character: '', groupLabel: '' }
    const character = meta.character_name ?? ''
    const groupLabel = meta.set_group ?? meta.set_label ?? ''
    return { character, groupLabel }
  }, [cardMetaByPk])

  const getOwnedDiceForCard = useCallback((cardPk: number) => {
    const { character, groupLabel } = getCardOwnershipKey(cardPk)
    if (!character) return 0
    return diceGet(character, groupLabel)
  }, [diceGet, getCardOwnershipKey])

  const teamSummaries = useMemo(() =>
    teams.map((team) => ({
      team,
      diceTotal: teamDiceTotals.get(team.team_id) ?? 0,
      cardCount: (teamCardsMap.get(team.team_id) ?? []).length
    })),
  [teams, teamCardsMap, teamDiceTotals])

  const selectedTeamCards = useMemo((): TeamCardInfo[] => {
    if (selectedTeamId == null) return []
    const entries = teamCardsMap.get(selectedTeamId) ?? []
    const detailed = entries
      .map((entry) => {
        const row = cardMetaByPk.get(entry.card_pk)
        if (!row) return null
        const maxDice = getCardMaxDice(entry.card_pk)
        const ownedDice = getOwnedDiceForCard(entry.card_pk)
        return {
          row,
          diceCount: entry.dice_count,
          maxDice,
          ownedDice
        }
      })
      .filter((item): item is TeamCardInfo => item != null)

    detailed.sort((a, b) => {
      const charA = (a.row.character_name || '').toLowerCase()
      const charB = (b.row.character_name || '').toLowerCase()
      if (charA !== charB) return charA.localeCompare(charB)
      const nameA = (a.row.card_name || '').toLowerCase()
      const nameB = (b.row.card_name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
    return detailed
  }, [selectedTeamId, teamCardsMap, cardMetaByPk, getCardMaxDice, getOwnedDiceForCard])

  const selectedTeamCardSet = useMemo(() => new Set(selectedTeamCards.map(info => info.row.card_pk)), [selectedTeamCards])

  const createTeam = useCallback((name?: string) => {
    const trimmed = (name ?? '').trim()
    const baseName = trimmed || `Team ${teams.length + 1}`
    runUser(
      `INSERT INTO teams(name, created_at, updated_at)
       VALUES(?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [baseName]
    )
    const row = runUser('SELECT last_insert_rowid() AS id')
    const newId = Number(row[0]?.id ?? 0)
    bumpTeams()
    if (newId > 0) {
      setSelectedTeamId(newId)
      setTeamView('detail')
      return newId
    }
    return null
  }, [runUser, bumpTeams, teams.length, setTeamView])

  const renameTeam = useCallback((teamId: number, nextName: string) => {
    const trimmed = nextName.trim()
    const safeName = trimmed || 'Untitled Team'
    runUser(
      `UPDATE teams SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id = ?`,
      [safeName, teamId]
    )
    bumpTeams()
  }, [runUser, bumpTeams])

  const deleteTeam = useCallback((teamId: number) => {
    runUser(`DELETE FROM team_cards WHERE team_id = ?`, [teamId])
    runUser(`DELETE FROM teams WHERE team_id = ?`, [teamId])
    setSelectedTeamId(prev => (prev === teamId ? null : prev))
    setTeamView('list')
    bumpTeams()
  }, [runUser, bumpTeams, setSelectedTeamId])

  const addCardToTeam = useCallback((teamId: number, cardPk: number) => {
    runUser(
      `INSERT OR IGNORE INTO team_cards(team_id, card_pk, dice_count) VALUES(?, ?, 0)`,
      [teamId, cardPk]
    )
    runUser(`UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE team_id = ?`, [teamId])
    bumpTeams()
  }, [runUser, bumpTeams])

  const removeCardFromTeam = useCallback((teamId: number, cardPk: number) => {
    runUser(`DELETE FROM team_cards WHERE team_id = ? AND card_pk = ?`, [teamId, cardPk])
    runUser(`UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE team_id = ?`, [teamId])
    bumpTeams()
  }, [runUser, bumpTeams])

  const setTeamCardDice = useCallback((teamId: number, cardPk: number, requested: number) => {
    const entries = teamCardsMap.get(teamId) ?? []
    const current = entries.find(e => e.card_pk === cardPk)?.dice_count ?? 0
    const sanitized = Math.max(0, Math.round(requested))
    const maxDiceForCard = Math.max(0, getCardMaxDice(cardPk))
    const ownedDice = Math.max(0, getOwnedDiceForCard(cardPk))
    const perCardCap = Math.min(maxDiceForCard, ownedDice)
    const totalForTeam = teamDiceTotals.get(teamId) ?? 0
    const totalWithoutCurrent = totalForTeam - current
    const teamCapRemaining = TEAM_MAX_DICE - totalWithoutCurrent
    const maxAllowed = Math.max(0, Math.min(perCardCap, teamCapRemaining))
    const next = Math.min(sanitized, maxAllowed)
    if (next === current) return current
    runUser(
      `INSERT INTO team_cards(team_id, card_pk, dice_count)
       VALUES(?, ?, ?)
       ON CONFLICT(team_id, card_pk) DO UPDATE SET dice_count = excluded.dice_count`,
      [teamId, cardPk, next]
    )
    runUser(`UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE team_id = ?`, [teamId])
    bumpTeams()
    return next
  }, [teamCardsMap, getCardMaxDice, getOwnedDiceForCard, teamDiceTotals, runUser, bumpTeams])

  const openTeamDiceModal = useCallback((teamId: number, card: CardRow, currentDice: number) => {
    const maxDice = getCardMaxDice(card.card_pk)
    const ownedDice = Math.max(0, getOwnedDiceForCard(card.card_pk))
    const totalForTeam = teamDiceTotals.get(teamId) ?? 0
    const totalWithoutCurrent = totalForTeam - currentDice
    const teamRemaining = Math.max(0, TEAM_MAX_DICE - totalWithoutCurrent)
    const perCardCap = Math.min(maxDice, ownedDice)
    const limit = Math.max(0, Math.min(perCardCap, teamRemaining))
    const character = card.character_name ?? ''
    const groupLabel = card.set_group ?? card.set_label ?? ''
    const displayName = card.card_name || character || 'Card'
    setCountModal({
      kind: 'team-dice',
      title: displayName,
      subtitle: character ? (groupLabel ? `${character} · ${groupLabel}` : character) : groupLabel || undefined,
      teamId,
      card_pk: card.card_pk,
      original: Math.min(currentDice, limit),
      value: Math.min(currentDice, limit),
      maxDice,
      ownedDice,
      teamRemaining,
      limit
    })
  }, [getCardMaxDice, getOwnedDiceForCard, teamDiceTotals])

  const handleTeamAddCard = useCallback((card: CardRow) => {
    if (selectedTeamId == null) return
    addCardToTeam(selectedTeamId, card.card_pk)
  }, [selectedTeamId, addCardToTeam])

  const applyCardDelta = (card_pk: number, character: string, groupLabel: string, delta: number, opts?: { foil?: boolean }) => {
    if (!delta) return
    if (opts?.foil) incFoil(card_pk, delta)
    else incCards(card_pk, delta)
    if (delta > 0 && diceLinkMode !== 'none') {
      const perCard = diceLinkMode === 'd1' ? 1 : 2
      const diceDelta = delta * perCard
      if (diceDelta > 0) {
        diceInc(character, groupLabel, diceDelta)
      }
    }
  }

  const handleMassModeSelect = useCallback((mode: 'none' | 'plus' | 'minus') => {
    setMassMode(prev => {
      if (mode === 'none') return 'none'
      return prev === mode ? 'none' : mode
    })
  }, [])

  const handleDiceModeSelect = useCallback((mode: 'none' | 'd1' | 'd2') => {
    setDiceLinkMode(prev => {
      if (mode === 'none') return 'none'
      return prev === mode ? 'none' : mode
    })
  }, [])

  const handleTradeKeepBothChange = useCallback((value: boolean) => {
    setTradeKeepBoth(value)
  }, [])

  const processImport = useCallback(async (file: File) => {
    if (!ready || !contentDb) {
      setImportError('Databases are not ready yet. Please try again in a moment.')
      return
    }
    if (!hasTable(contentDb, 'tz_card_map')) {
      setImportError('tz_card_map table is missing from the content database.')
      return
    }

    setImporting(true)
    setImportError(null)
    setImportReport(null)

    const sanitizeCount = (raw?: string | null): number | null => {
      if (raw == null) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      const num = Number(trimmed)
      if (!Number.isFinite(num)) return null
      return Math.max(0, Math.round(num))
    }

    const resolveMeta = (cardPk: number) => {
      const cached = cardMetaByPk.get(cardPk)
      if (cached) {
        return {
          character: cached.character_name,
          setGroup: cached.set_group ?? null,
          setLabel: cached.set_label ?? null,
          typeName: cached.type_name ?? null
        }
      }
      try {
        const stmt = contentDb.prepare(
          `SELECT character_name, set_group, set_label, type_name
           FROM card_rows
           WHERE card_pk = ?
           LIMIT 1`
        )
        stmt.bind([cardPk])
        let meta: { character: string; setGroup: string | null; setLabel: string | null; typeName: string | null } | null = null
        if (stmt.step()) {
          const data = stmt.getAsObject() as any
          meta = {
            character: data.character_name ? String(data.character_name) : '',
            setGroup: data.set_group ?? null,
            setLabel: data.set_label ?? null,
            typeName: data.type_name ?? null
          }
        }
        stmt.free()
        return meta
      } catch (err) {
        console.warn('Failed to resolve card metadata', err)
        return null
      }
    }

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) throw new Error('CSV file is empty.')

      const header = rows.shift()!.map(col => col.trim())
      const headerMap = new Map<string, number>()
      header.forEach((name, index) => headerMap.set(name.toLowerCase(), index))

      const requireColumn = (label: string) => {
        const idx = headerMap.get(label.toLowerCase())
        if (idx == null) throw new Error(`Missing column "${label}" in CSV.`)
        return idx
      }

      const idxSet = requireColumn('set')
      const idxCharacter = requireColumn('character')
      const idxCardName = requireColumn('card name')
      const idxCardsOwned = requireColumn('cards owned')
      const idxFoilsOwned = requireColumn('foils owned')
      const idxDiceOwned = requireColumn('dice owned')

      const cardUpdates = new Map<number, { standard?: number | null; foil?: number | null }>()
      const diceUpdates = new Map<string, { character: string; groupLabel: string; count: number }>()
      const unmatchedMap = new Map<string, ImportRowIdentifier>()

      const lookup = contentDb.prepare(
        `SELECT card_pk FROM tz_card_map WHERE tz_set = ? AND tz_character = ? AND tz_card_name = ? LIMIT 1`
      )

      try {
        for (const rawRow of rows) {
          const setVal = (rawRow[idxSet] ?? '').trim()
          const characterVal = (rawRow[idxCharacter] ?? '').trim()
          const cardNameVal = (rawRow[idxCardName] ?? '').trim()

          if (!setVal && !characterVal && !cardNameVal) continue

          if (!characterVal || !cardNameVal) {
            const key = `${setVal}||${characterVal}||${cardNameVal}`
            if (!unmatchedMap.has(key)) {
              unmatchedMap.set(key, { set: setVal, character: characterVal, card: cardNameVal })
            }
            continue
          }

          lookup.bind([setVal, characterVal, cardNameVal])
          let cardPk: number | null = null
          if (lookup.step()) {
            const row = lookup.getAsObject() as any
            if (row.card_pk != null) cardPk = Number(row.card_pk)
          }
          lookup.reset()

          if (!cardPk) {
            const key = `${setVal}||${characterVal}||${cardNameVal}`
            if (!unmatchedMap.has(key)) unmatchedMap.set(key, { set: setVal, character: characterVal, card: cardNameVal })
            continue
          }

          const meta = resolveMeta(cardPk)
          if (!meta || !meta.character) {
            const key = `${setVal}||${characterVal}||${cardNameVal}`
            if (!unmatchedMap.has(key)) unmatchedMap.set(key, { set: setVal, character: characterVal, card: cardNameVal })
            continue
          }

          const standardCount = sanitizeCount(rawRow[idxCardsOwned])
          const foilRaw = rawRow[idxFoilsOwned] ?? ''
          const foilTrimmed = foilRaw.trim()
          const foilCount = foilTrimmed === '-1' ? null : sanitizeCount(foilTrimmed)
          const diceCount = sanitizeCount(rawRow[idxDiceOwned])

          if (!cardUpdates.has(cardPk)) cardUpdates.set(cardPk, {})
          const update = cardUpdates.get(cardPk)!
          if (standardCount != null) update.standard = standardCount
          if (foilCount != null) update.foil = foilCount

          if (diceCount != null && !isBasic(meta.typeName || '')) {
            const characterName = meta.character || characterVal
            const groupLabel = meta.setGroup ?? meta.setLabel ?? 'Other'
            const key = diceKey(characterName, groupLabel)
            const prev = diceUpdates.get(key)
            const nextCount = prev ? Math.max(prev.count, diceCount) : diceCount
            diceUpdates.set(key, { character: characterName, groupLabel, count: nextCount })
          }
        }
      } finally {
        lookup.free()
      }

      let totalStandard = 0
      let totalFoil = 0
      let diceTotal = 0
      let anyCardUpdated = false
      let anyDiceUpdated = false

      cardUpdates.forEach((values, cardPk) => {
        const shouldUpdateStandard = values.standard != null
        const shouldUpdateFoil = values.foil != null
        if (!shouldUpdateStandard && !shouldUpdateFoil) return
        const current = runUser(
          `SELECT have_cards, have_foil FROM collection WHERE card_pk = ? LIMIT 1`,
          [cardPk]
        )[0] as { have_cards?: number; have_foil?: number } | undefined
        const currentCards = current?.have_cards != null ? Number(current.have_cards) : 0
        const currentFoil = current?.have_foil != null ? Number(current.have_foil) : 0
        const nextCards = shouldUpdateStandard ? values.standard! : currentCards
        const nextFoil = shouldUpdateFoil ? values.foil! : currentFoil
        runUser(
          `INSERT INTO collection(card_pk, have_cards, have_foil)
           VALUES(?, ?, ?)
           ON CONFLICT(card_pk) DO UPDATE SET
             have_cards = excluded.have_cards,
             have_foil = excluded.have_foil`,
          [cardPk, nextCards, nextFoil]
        )
        if (shouldUpdateStandard) {
          totalStandard += nextCards
          anyCardUpdated = true
        }
        if (shouldUpdateFoil) {
          totalFoil += nextFoil
          anyCardUpdated = true
        }
      })

      diceUpdates.forEach(({ character, groupLabel, count }) => {
        runUser(
          `INSERT INTO collection_dice(character_name, set_group, dice_count)
           VALUES(?, ?, ?)
           ON CONFLICT(character_name, set_group) DO UPDATE SET dice_count = excluded.dice_count`,
          [character, groupLabel, count]
        )
        diceTotal += count
        anyDiceUpdated = true
      })

      if (anyCardUpdated || anyDiceUpdated) bumpCollection()

      setImportReport({
        totalStandard,
        totalFoil,
        diceTotal,
        unmatched: Array.from(unmatchedMap.values())
      })
    } catch (err: any) {
      console.error('Import failed', err)
      setImportError(err?.message ?? 'Import failed.')
    } finally {
      setImporting(false)
    }
  }, [ready, contentDb, cardMetaByPk, runUser, bumpCollection])

  const processTradeImport = useCallback(async (file: File) => {
    if (!ready || !contentDb) {
      setTradeImportError('Databases are not ready yet. Please try again shortly.')
      return
    }
    if (!tradeSnapshot) {
      setTradeImportError('Trade data is not ready yet. Please try again shortly.')
      return
    }
    if (!hasTable(contentDb, 'tz_card_map')) {
      setTradeImportError('tz_card_map table is missing from the content database.')
      return
    }

    setTradeImporting(true)
    setTradeImportError(null)

    const parseCount = (value: unknown): number => {
      if (value == null) return 0
      const trimmed = String(value).trim()
      if (!trimmed) return 0
      const num = Number(trimmed)
      if (!Number.isFinite(num) || num < 0) return 0
      return Math.round(num)
    }

    const partnerCardMap = new Map<number, TradePartnerCardInfo>()
    const partnerDiceMap = new Map<string, TradePartnerDiceInfo>()
    const unmatchedSet = new Set<string>()
    const unmatched: ImportRowIdentifier[] = []
    let totalSpareStandard = 0
    let totalSpareFoil = 0
    let totalSpareDice = 0
    let totalNeedStandard = 0
    let totalNeedFoil = 0
    let totalNeedAny = 0
    let totalNeedDice = 0
    let totalRows = 0
    let succeeded = false

    const lookup = contentDb.prepare(
      `SELECT card_pk FROM tz_card_map WHERE tz_set = ? AND tz_character = ? AND tz_card_name = ? LIMIT 1`
    )

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) throw new Error('CSV file is empty.')

      const header = rows.shift()!
      const headerMap = new Map<string, number>()
      header.forEach((name, index) => headerMap.set(name.trim().toLowerCase(), index))

      const findColumn = (...labels: string[]): number | null => {
        for (const label of labels) {
          const idx = headerMap.get(label.toLowerCase())
          if (idx != null) return idx
        }
        return null
      }

      const requireColumn = (labels: string[], display: string) => {
        const idx = findColumn(...labels)
        if (idx == null) throw new Error(`Missing column "${display}" in CSV.`)
        return idx
      }

      const idxSet = requireColumn(['set'], 'Set')
      const idxCharacter = requireColumn(['character'], 'Character')
      const idxCardName = requireColumn(['card name'], 'Card Name')
      const idxCardPk = findColumn('card pk', 'card_pk')
      const idxStandardSpare = findColumn('standard spare', 'cards spare')
      const idxStandardOwned = findColumn('standard owned', 'cards owned')
      const idxFoilSpare = findColumn('foil spare', 'foils spare')
      const idxFoilOwned = findColumn('foil owned', 'foils owned')
      const idxNeedStandard = findColumn('need standard')
      const idxNeedFoil = findColumn('need foil')
      const idxNeedAny = findColumn('need any')
      const idxDiceSpare = findColumn('dice spare')
      const idxDiceOwned = findColumn('dice owned')
      const idxDiceRequired = findColumn('dice required')
      const idxDiceNeed = findColumn('dice need', 'need dice')

      for (const rawRow of rows) {
        const setVal = (rawRow[idxSet] ?? '').trim()
        const characterVal = (rawRow[idxCharacter] ?? '').trim()
        const cardNameVal = (rawRow[idxCardName] ?? '').trim()
        if (!setVal && !characterVal && !cardNameVal) continue
        totalRows += 1

        let cardPk: number | null = null
        if (idxCardPk != null) {
          const rawPk = (rawRow[idxCardPk] ?? '').trim()
          if (rawPk) {
            const parsed = Number(rawPk)
            if (Number.isInteger(parsed) && parsed > 0) cardPk = parsed
          }
        }
        if (!cardPk && characterVal && cardNameVal) {
          lookup.bind([setVal, characterVal, cardNameVal])
          if (lookup.step()) {
            const data = lookup.getAsObject() as any
            if (data.card_pk != null) {
              const n = Number(data.card_pk)
              if (Number.isInteger(n) && n > 0) cardPk = n
            }
          }
          lookup.reset()
        }

        const standardSpare = idxStandardSpare != null ? parseCount(rawRow[idxStandardSpare]) : (idxStandardOwned != null ? parseCount(rawRow[idxStandardOwned]) : 0)
        const foilSpare = idxFoilSpare != null ? parseCount(rawRow[idxFoilSpare]) : (idxFoilOwned != null ? parseCount(rawRow[idxFoilOwned]) : 0)
        const needStandard = idxNeedStandard != null ? parseCount(rawRow[idxNeedStandard]) : 0
        const needFoil = idxNeedFoil != null ? parseCount(rawRow[idxNeedFoil]) : 0
        const needAny = idxNeedAny != null ? parseCount(rawRow[idxNeedAny]) : 0
        const diceSpare = idxDiceSpare != null ? parseCount(rawRow[idxDiceSpare]) : 0
        const diceOwned = idxDiceOwned != null ? parseCount(rawRow[idxDiceOwned]) : 0
        const diceRequired = idxDiceRequired != null ? parseCount(rawRow[idxDiceRequired]) : 0
        const diceNeed = idxDiceNeed != null ? parseCount(rawRow[idxDiceNeed]) : 0

        totalSpareStandard += standardSpare
        totalSpareFoil += foilSpare
        totalSpareDice += diceSpare
        totalNeedStandard += needStandard
        totalNeedFoil += needFoil
        totalNeedAny += needAny
        totalNeedDice += diceNeed

        if (!cardPk) {
          const key = `${setVal}||${characterVal}||${cardNameVal}`
          if (!unmatchedSet.has(key)) {
            unmatchedSet.add(key)
            unmatched.push({ set: setVal || null, character: characterVal || null, card: cardNameVal || null })
          }

          // still record aggregate dice data if available by character
          if (diceSpare > 0 || diceNeed > 0 || diceOwned > 0 || diceRequired > 0) {
            const key = diceKey(characterVal || 'Unknown', setVal || 'Other')
            const diceInfo = partnerDiceMap.get(key) ?? { spare: 0, need: 0, owned: 0, required: 0 }
            diceInfo.spare = Math.max(diceInfo.spare, diceSpare)
            diceInfo.need = Math.max(diceInfo.need, diceNeed)
            diceInfo.owned = Math.max(diceInfo.owned, diceOwned)
            diceInfo.required = Math.max(diceInfo.required, diceRequired)
            partnerDiceMap.set(key, diceInfo)
          }
          continue
        }

        if (standardSpare > 0 || foilSpare > 0 || needStandard > 0 || needFoil > 0 || needAny > 0) {
          const info = partnerCardMap.get(cardPk) ?? {
            spareStandard: 0,
            spareFoil: 0,
            needStandard: 0,
            needFoil: 0,
            needAny: 0
          }
          info.spareStandard = Math.max(info.spareStandard, standardSpare)
          info.spareFoil = Math.max(info.spareFoil, foilSpare)
          info.needStandard = Math.max(info.needStandard, needStandard)
          info.needFoil = Math.max(info.needFoil, needFoil)
          info.needAny = Math.max(info.needAny, needAny)
          partnerCardMap.set(cardPk, info)
        }

        const meta = cardMetaByPk.get(cardPk)
        const characterName = meta?.character_name ?? characterVal
        const { groupLabel } = getTradeSetInfo(meta ?? null)
        const diceKeyValue = characterName ? diceKey(characterName, groupLabel) : diceKey(characterVal || 'Unknown', groupLabel)

        if (diceSpare > 0 || diceNeed > 0 || diceOwned > 0 || diceRequired > 0) {
          const info = partnerDiceMap.get(diceKeyValue) ?? { spare: 0, need: 0, owned: 0, required: 0 }
          info.spare = Math.max(info.spare, diceSpare)
          info.need = Math.max(info.need, diceNeed)
          info.owned = Math.max(info.owned, diceOwned)
          info.required = Math.max(info.required, diceRequired)
          partnerDiceMap.set(diceKeyValue, info)
        }
      }

      succeeded = true
    } catch (err: any) {
      console.error('Trade import failed', err)
      setTradeImportError(err?.message ?? 'Import failed.')
    } finally {
      lookup.free()
      setTradeImporting(false)
    }

    if (!succeeded) return

    const cardsForState = new Map<number, TradePartnerCardInfo>()
    partnerCardMap.forEach((info, cardPk) => {
      cardsForState.set(cardPk, { ...info })
    })

    const diceForState = new Map<string, TradePartnerDiceInfo>()
    partnerDiceMap.forEach((info, key) => {
      diceForState.set(key, { ...info })
    })

    setTradePartnerData({
      cards: cardsForState,
      dice: diceForState,
      unmatched,
      totals: {
        spareStandard: totalSpareStandard,
        spareFoil: totalSpareFoil,
        spareDice: totalSpareDice,
        needStandard: totalNeedStandard,
        needFoil: totalNeedFoil,
        needAny: totalNeedAny,
        needDice: totalNeedDice,
        rows: totalRows
      }
    })
  }, [ready, contentDb, tradeSnapshot, hasTable, cardMetaByPk, getTradeSetInfo])

  const handleTradeImportClick = useCallback(async () => {
    setTradeImportError(null)
    if (!ready || !contentDb) {
      setTradeImportError('Databases are not ready yet. Please try again shortly.')
      return
    }

    if (nativeEnv) {
      const nativeFile = await pickNativeFile([
        'text/csv',
        'application/vnd.ms-excel',
        'application/csv'
      ])
      if (nativeFile) {
        await processTradeImport(nativeFile)
        return
      }
    }

    const picker = (window as any)?.showOpenFilePicker
    if (typeof picker === 'function') {
      try {
        const handles: any[] = await picker({
          multiple: false,
          types: [
            {
              description: 'CSV Files',
              accept: {
                'text/csv': ['.csv'],
                'application/vnd.ms-excel': ['.csv'],
                'application/csv': ['.csv']
              }
            }
          ],
          excludeAcceptAllOption: true
        })
        const handle = handles?.[0]
        if (handle && typeof handle.getFile === 'function') {
          const tradeFile: File = await handle.getFile()
          await processTradeImport(tradeFile)
          return
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        console.warn('showOpenFilePicker unavailable, falling back to hidden input', err)
      }
    }

    tradeFileInputRef.current?.click()
  }, [nativeEnv, pickNativeFile, ready, contentDb, processTradeImport])

  const handleTradeImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    await processTradeImport(file)
  }, [processTradeImport])

  const handleExportTrades = useCallback(async () => {
    if (!ready) return
    if (!tradeSnapshot) {
      setTradeImportError('Trade data is not ready yet. Please try again shortly.')
      return
    }
    if (typeof window === 'undefined') return

    setTradeImportError(null)

    const diceEntryByKey = new Map(tradeSnapshot.diceEntries.map((entry) => [entry.key, entry]))

    const rows: string[][] = [[
      'Set',
      'Character',
      'Card Name',
      'Card PK',
      'Standard Owned',
      'Foil Owned',
      'Standard Spare',
      'Foil Spare',
      'Need Standard',
      'Need Foil',
      'Need Any',
      'Prefer Foil',
      'Dice Owned',
      'Dice Required',
      'Dice Spare',
      'Dice Need'
    ]]
    const escapeCsv = (value: string) => {
      const str = value ?? ''
      if (/[",\r\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"'
      }
      return str
    }

    const cardDetails = Array.from(tradeSnapshot.cardDetailMap.values()).sort((a, b) => {
      const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
      if (charCmp !== 0) return charCmp
      const setCmp = a.set.localeCompare(b.set, undefined, { sensitivity: 'base' })
      if (setCmp !== 0) return setCmp
      return (a.cardName || '').localeCompare(b.cardName || '', undefined, { sensitivity: 'base' })
    })

    cardDetails.forEach((detail) => {
      const diceEntry = diceEntryByKey.get(detail.diceKey)
      const preferFoilLabel = detail.preferFoil ? 'yes' : ''
      rows.push([
        escapeCsv(detail.set),
        escapeCsv(detail.character),
        escapeCsv(detail.cardName || ''),
        detail.cardPk ? String(detail.cardPk) : '',
        String(detail.standardOwned),
        String(detail.foilOwned),
        String(detail.spareStandard),
        String(detail.spareFoil),
        String(detail.needStandard),
        String(detail.needFoil),
        String(detail.needAny),
        preferFoilLabel,
        diceEntry ? String(diceEntry.owned) : '0',
        diceEntry ? String(diceEntry.required) : '0',
        diceEntry ? String(diceEntry.spare) : '0',
        diceEntry ? String(diceEntry.need) : '0'
      ])
    })

    tradeSnapshot.diceEntries.forEach((entry) => {
      if (entry.repCardPk != null) return
      rows.push([
        escapeCsv(entry.set),
        escapeCsv(entry.character),
        'Dice',
        '',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '',
        String(entry.owned),
        String(entry.required),
        String(entry.spare),
        String(entry.need)
      ])
    })

    if (rows.length === 1) {
      setTradeImportError('No trade data available to export.')
      return
    }

    const csv = rows.map(row => row.join(',')).join('\r\n')
    if (nativeEnv) {
      const filename = `trade-data-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-').replace('Z', '')}.csv`
      const bytes = new TextEncoder().encode(csv)
      try {
        await saveDocumentWithDialog({
          filename,
          bytes,
          mimeType: 'text/csv'
        })
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert('Trade export saved.')
        }
      } catch (dialogErr) {
        console.warn('Trade export save dialog failed, falling back to internal storage', dialogErr)
        try {
          const result = await saveNativeBinaryFile({
            filename,
            bytes,
            directory: Directory.Documents,
            relativeDir: ['Prep Area', 'Exports']
          })
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`Trade export saved to ${result.displayPath}.`)
          }
        } catch (err) {
          console.error('Failed to save native trade export', err)
          setTradeImportError('Failed to save trade export on this device.')
        }
      }
      return
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'trade-data.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [ready, tradeSnapshot, cardMetaByPk, getTradeSetInfo, nativeEnv])

  const handleImportClick = useCallback(async () => {
    setImportError(null)
    setImportReport(null)
    if (!ready || !contentDb) {
      setImportError('Databases are not ready yet. Please try again shortly.')
      return
    }

    if (nativeEnv) {
      const nativeFile = await pickNativeFile([
        'text/csv',
        'application/vnd.ms-excel',
        'application/csv'
      ])
      if (nativeFile) {
        await processImport(nativeFile)
        return
      }
    }

    const picker = (window as any)?.showOpenFilePicker
    if (typeof picker === 'function') {
      try {
        const handles: any[] = await picker({
          multiple: false,
          types: [
            {
              description: 'CSV Files',
              accept: {
                'text/csv': ['.csv'],
                'application/vnd.ms-excel': ['.csv'],
                'application/csv': ['.csv']
              }
            }
          ],
          excludeAcceptAllOption: true
        })
        const handle = handles?.[0]
        if (handle && typeof handle.getFile === 'function') {
          const file: File = await handle.getFile()
          await processImport(file)
          return
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        console.warn('showOpenFilePicker unavailable, falling back to hidden input', err)
      }
    }

    fileInputRef.current?.click()
  }, [nativeEnv, pickNativeFile, ready, contentDb, processImport])

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    await processImport(file)
  }, [processImport])

  const handleBackupDb = useCallback(() => {
    if (!ready) return
    void exportUserDb()
  }, [ready, exportUserDb])

  const processBackupFile = useCallback(async (file: File) => {
    if (!ready) return
    setBackupImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      await restoreUserDb(new Uint8Array(buffer))
      setBackupImportError(null)
      setCollectionVersion(v => v + 1)
      setTeamsVersion(v => v + 1)
      setImportReport(null)
      setImportError(null)
      setTradeImportError(null)
      setTradePartnerData(null)
      scheduleUserDbSave()
    } catch (err) {
      console.error('Failed to import database backup', err)
      const message = err instanceof Error ? err.message : 'Failed to import database backup.'
      setBackupImportError(message)
    } finally {
      setBackupImporting(false)
    }
  }, [ready, restoreUserDb, scheduleUserDbSave, setCollectionVersion, setTeamsVersion, setImportReport, setImportError, setTradeImportError, setTradePartnerData, setBackupImportError])

  const handleImportBackupFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    await processBackupFile(file)
  }, [processBackupFile])

  const handleImportBackupClick = useCallback(async () => {
    if (!ready || backupImporting) return
    setBackupImportError(null)
    if (nativeEnv) {
      const nativeFile = await pickNativeFile([
        'application/octet-stream',
        'application/x-sqlite3',
        'application/vnd.sqlite3',
        'application/sqlite'
      ])
      if (nativeFile) {
        await processBackupFile(nativeFile)
        return
      }
    }
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const opts = {
          multiple: false,
          excludeAcceptAllOption: true,
          types: [
            {
              description: 'Dice Masters Backup',
              accept: {
                'application/octet-stream': ['.sqlite'],
                'application/x-sqlite3': ['.sqlite']
              }
            }
          ]
        } as any
        const handles: FileSystemFileHandle[] | undefined = await (window as any).showOpenFilePicker(opts)
        const handle = handles?.[0]
        if (handle && typeof handle.getFile === 'function') {
          const file: File = await handle.getFile()
          await processBackupFile(file)
          return
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        console.warn('showOpenFilePicker unavailable for backup import, falling back to hidden input', err)
      }
    }
    backupFileInputRef.current?.click()
  }, [nativeEnv, pickNativeFile, ready, backupImporting, processBackupFile, setBackupImportError])

  const handleInstallClick = useCallback(async () => {
    const promptEvent = installPromptRef.current
    if (!promptEvent || typeof promptEvent.prompt !== 'function') return
    setCanInstallPwa(false)
    try {
      await promptEvent.prompt()
      if (promptEvent.userChoice) {
        await promptEvent.userChoice
      }
    } catch (err) {
      console.warn('PWA installation prompt failed', err)
    } finally {
      installPromptRef.current = null
      clearInstallPrompt()
    }
  }, [])

  const handleDownloadImages = useCallback(async () => {
    if (imageCacheStatus === 'downloading') return
    if (typeof window === 'undefined' || typeof caches === 'undefined' || !('serviceWorker' in navigator)) {
      setImageCacheStatus('unsupported')
      setImageCacheMessage('Offline image caching is unavailable in this browser.')
      return
    }
    if (!window.isSecureContext) {
      setImageCacheStatus('unsupported')
      setImageCacheMessage('Offline caching requires HTTPS (or localhost). Serve the app securely and try again.')
      return
    }
    if (totalOfflineImages === 0) {
      setImageCacheStatus('error')
      setImageCacheMessage('No image files were found to cache.')
      return
    }
    setImageCacheStatus('downloading')
    setImageCacheProgress(0)
    setImageCacheMessage('Caching images. Keep this tab open until the download completes.')
    try {
      await navigator.serviceWorker.ready
      const cache = await caches.open('card-images-v2')
      let completed = 0
      for (const url of OFFLINE_IMAGE_URLS) {
        try {
          const existing = await cache.match(url)
          if (!existing) {
            const response = await fetch(url)
            if (response.ok) {
              await cache.put(url, response.clone())
            } else {
              console.warn('Image fetch failed', url, response.status)
            }
          }
        } catch (err) {
          console.warn('Image fetch failed', url, err)
        }
        completed += 1
        setImageCacheProgress(completed)
      }
      setImageCacheProgress(totalOfflineImages)
      setImageCacheStatus('complete')
      setImageCacheMessage('Images cached for offline use.')
    } catch (err) {
      console.error('Offline image caching failed', err)
      setImageCacheStatus('error')
      setImageCacheMessage('Offline image download failed. Check your connection and try again.')
    }
  }, [imageCacheStatus, totalOfflineImages])

  const buildStats = useCallback((): CollectionStats => {
    const collectionRows = runUser(
      `SELECT card_pk, have_cards, have_foil FROM collection`
    ) as Array<{ card_pk?: number; have_cards?: number; have_foil?: number }>

    let totalStandard = 0
    let totalFoil = 0
    const ownedCardPks = new Set<number>()
    const collectionByPk = new Map<number, { cards: number; foils: number }>()

    for (const row of collectionRows) {
      const cardPk = Number(row.card_pk)
      if (!Number.isFinite(cardPk)) continue
      const cards = Math.max(0, Number(row.have_cards ?? 0))
      const foils = Math.max(0, Number(row.have_foil ?? 0))
      totalStandard += cards
      totalFoil += foils
      collectionByPk.set(cardPk, { cards, foils })
      if (cards > 0 || foils > 0) ownedCardPks.add(cardPk)
    }

    const diceRows = runUser(`SELECT dice_count FROM collection_dice`) as Array<{ dice_count?: number }>
    let totalDice = 0
    for (const row of diceRows) {
      const dice = Math.max(0, Number(row.dice_count ?? 0))
      totalDice += dice
    }

    const totalUnique = allRows.length
    let uniqueOwned = 0
    let uniqueFoilOwned = 0
    let foilEligibleTotal = 0

    const universeTotals = new Map<string, {
      total: number
      owned: number
      foilTotal: number
      foilOwned: number
      sets: Map<string, { name: string; total: number; owned: number; foilTotal: number; foilOwned: number }>
    }>()

    const universeLabel = (value?: string | null) => {
      const label = (value ?? '').trim()
      return label ? label : 'Uncategorized'
    }

    const setGroupInfoFor = (row: CardRow) => {
      const groupRaw = (row.set_group ?? '').trim()
      if (groupRaw) {
        const display = setGroupLabelMap.get(groupRaw) ?? groupRaw
        return { key: groupRaw, name: display }
      }
      const labelRaw = (row.set_label ?? '').trim()
      if (labelRaw) {
        return { key: labelRaw, name: labelRaw }
      }
      return { key: 'Unknown Set', name: 'Unknown Set' }
    }

    for (const row of allRows) {
      const label = universeLabel(row.universe)
      const entry = universeTotals.get(label) ?? {
        total: 0,
        owned: 0,
        foilTotal: 0,
        foilOwned: 0,
        sets: new Map<string, { name: string; total: number; owned: number; foilTotal: number; foilOwned: number }>()
      }
      entry.total += 1
      if (row.has_foil) {
        entry.foilTotal += 1
        foilEligibleTotal += 1
      }
      const { key: setKey, name: setName } = setGroupInfoFor(row)
      const setEntry = entry.sets.get(setKey) ?? { name: setName, total: 0, owned: 0, foilTotal: 0, foilOwned: 0 }
      setEntry.name = setName
      setEntry.total += 1
      if (row.has_foil) setEntry.foilTotal += 1
      entry.sets.set(setKey, setEntry)
      universeTotals.set(label, entry)
    }

    for (const cardPk of ownedCardPks) {
      const meta = cardMetaByPk.get(cardPk)
      if (!meta) continue
      uniqueOwned += 1
      const cardCollection = collectionByPk.get(cardPk)
      const foilsOwned = cardCollection ? cardCollection.foils > 0 : false
      const label = universeLabel(meta.universe ?? null)
      const entry = universeTotals.get(label) ?? {
        total: 0,
        owned: 0,
        foilTotal: 0,
        foilOwned: 0,
        sets: new Map<string, { name: string; total: number; owned: number; foilTotal: number; foilOwned: number }>()
      }
      entry.owned += 1
      if (meta.has_foil) {
        if (foilsOwned) {
          entry.foilOwned += 1
          uniqueFoilOwned += 1
        }
      }
      const { key: setKey, name: setName } = setGroupInfoFor(meta)
      const setEntry = entry.sets.get(setKey) ?? { name: setName, total: 0, owned: 0, foilTotal: 0, foilOwned: 0 }
      setEntry.name = setName
      setEntry.owned += 1
      if (meta.has_foil && foilsOwned) setEntry.foilOwned += 1
      entry.sets.set(setKey, setEntry)
      universeTotals.set(label, entry)
    }

    const universes = Array.from(universeTotals.entries())
      .map(([name, { total, owned, foilTotal, foilOwned, sets }]) => ({
        name,
        total,
        owned,
        percent: total ? (owned / total) * 100 : 0,
        foilTotal,
        foilOwned,
        foilPercent: foilTotal ? (foilOwned / foilTotal) * 100 : 0,
        sets: Array.from(sets.values())
          .map((stats) => ({
            name: stats.name,
            total: stats.total,
            owned: stats.owned,
            percent: stats.total ? (stats.owned / stats.total) * 100 : 0,
            foilTotal: stats.foilTotal,
            foilOwned: stats.foilOwned,
            foilPercent: stats.foilTotal ? (stats.foilOwned / stats.foilTotal) * 100 : 0
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    return {
      totalStandard,
      totalFoil,
      totalDice,
      uniqueOwned,
      uniqueTotal: totalUnique,
      uniqueFoilOwned,
      foilEligibleTotal,
      universes
    }
  }, [runUser, allRows, cardMetaByPk, setGroupLabelMap])

  const handleStatsToggle = useCallback((nextOpen: boolean) => {
    setStatsOpen((prev) => {
      if (nextOpen && !prev) {
        setStatsRefreshKey((key) => key + 1)
      }
      return nextOpen
    })
  }, [])

  useEffect(() => {
    if (!statsOpen) return
    if (!ready) {
      setStatsData(null)
      setStatsError('Databases are not ready yet.')
      return
    }
    setStatsLoading(true)
    setStatsError(null)
    try {
      const data = buildStats()
      setStatsData(data)
    } catch (err: any) {
      console.error('Failed to build stats', err)
      setStatsData(null)
      setStatsError(err?.message ?? 'Failed to build stats.')
    } finally {
      setStatsLoading(false)
    }
  }, [statsOpen, statsRefreshKey, collectionVersion, ready, buildStats])

  const bumpCountModal = (delta: number) => {
    if (!delta) return
    setCountModal((prev) => {
      if (!prev) return prev
      let nextValue = Math.max(0, prev.value + delta)
      if (prev.kind === 'team-dice') {
        nextValue = Math.min(nextValue, prev.limit)
      }
      if (nextValue === prev.value) return prev
      return { ...prev, value: nextValue }
    })
  }

  const closeCountModal = useCallback(() => {
    setCountModal(null)
  }, [])

  const confirmCountModal = () => {
    if (!countModal) return
    const safeValue = Math.max(0, Math.round(countModal.value))
    const delta = safeValue - countModal.original
    if (countModal.kind === 'team-dice') {
      const bounded = Math.min(safeValue, countModal.limit)
      setTeamCardDice(countModal.teamId, countModal.card_pk, bounded)
    } else if (delta !== 0) {
      if (countModal.kind === 'dice') {
        diceInc(countModal.character, countModal.groupLabel, delta)
      } else if (countModal.kind === 'standard') {
        applyCardDelta(countModal.card_pk, countModal.character, countModal.groupLabel, delta)
      } else {
        applyCardDelta(countModal.card_pk, countModal.character, countModal.groupLabel, delta, { foil: true })
      }
    }
    closeCountModal()
  }

  // ---------- Image modal ----------
  const [imageFor, setImageFor] = useState<{ card: CardRow, info: ImageInfo, index: number, sideIndex: number } | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [cardTextMap, setCardTextMap] = useState<Record<number, { text_html: string | null; global_text_html: string | null }>>({})
  const cardTextRef = useRef(cardTextMap)
  const textLoading = useRef(new Set<number>())
  const touchStartPoint = useRef<{ x: number; y: number } | null>(null)
  const lastWheelTime = useRef<number>(0)
  const viewerPushedRef = useRef(false)
  const imageTableModeRef = useRef<'unknown' | 'legacy' | 'split'>('unknown')
  useEffect(() => {
    cardTextRef.current = cardTextMap
  }, [cardTextMap])

  const ensureCardText = useCallback((card_pk: number) => {
    if (!contentDb) return
    if (cardTextRef.current[card_pk] || textLoading.current.has(card_pk)) return
    textLoading.current.add(card_pk)
    try {
      const result = tryRun(contentDb, `SELECT text_html, global_text_html FROM cards WHERE card_pk = ? LIMIT 1`, [card_pk])
      const row = (result.ok && result.rows.length) ? (result.rows[0] as any) : null
      const payload = {
        text_html: row?.text_html ?? null,
        global_text_html: row?.global_text_html ?? null
      }
      setCardTextMap(prev => {
        if (prev[card_pk]) return prev
        return { ...prev, [card_pk]: payload }
      })
    } catch (err) {
      console.warn('Failed to load card text', err)
      setCardTextMap(prev => {
        if (prev[card_pk]) return prev
        return { ...prev, [card_pk]: { text_html: null, global_text_html: null } }
      })
    } finally {
      textLoading.current.delete(card_pk)
    }
  }, [contentDb, tryRun])

  const isLikelyFlipCard = useCallback((card?: CardRow | null) => {
    if (!card) return false
    const typeName = (card.type_name || '').toLowerCase()
    if (typeName.includes('flip')) return true
    const combined = `${card.character_name || ''} ${card.card_name || ''}`.toLowerCase()
    return combined.includes(' flip') || combined.includes('(flip') || combined.includes(' dual ') || combined.includes(' double ')
  }, [])

  const getImageInfo = useCallback((db: Database, card_pk: number, card?: CardRow | null): ImageInfo => {
    const normalizeRel = (rel?: string | null) => {
      if (!rel) return null
      return String(rel).replace(/^\/+/, '')
    }
    const formatLabel = (side: string) => {
      const normalized = side.toLowerCase()
      if (normalized === 'front') return 'Front'
      if (normalized === 'back') return 'Back'
      return side
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    }
    const buildSide = (side: string, rel: string | null, width?: number | null, height?: number | null): ImageSideInfo => {
      const safeRel = normalizeRel(rel)
      const numericWidth = typeof width === 'number' && Number.isFinite(width) ? width : null
      const numericHeight = typeof height === 'number' && Number.isFinite(height) ? height : null
      return {
        side,
        label: formatLabel(side),
        rel_path: safeRel,
        url: safeRel ? `${IMAGES_ROOT}/${safeRel}` : null,
        width: numericWidth,
        height: numericHeight
      }
    }
    const expandFlipSides = (source: ImageSideInfo, fallbackCard?: CardRow | null): ImageSideInfo[] => {
      if (!source.rel_path) return [source]
      const rel = source.rel_path
      const frontMatch = rel.match(/^(.*?)-front(\.[^.]+)$/i)
      const backMatch = rel.match(/^(.*?)-back(\.[^.]+)$/i)
      if (frontMatch || backMatch) {
        const base = (frontMatch ?? backMatch)![1]
        const ext = (frontMatch ?? backMatch)![2]
        const frontSide = buildSide('front', `${base}-front${ext}`, source.width, source.height)
        const backSide = buildSide('back', `${base}-back${ext}`, source.width, source.height)
        return [frontSide, backSide]
      }
      if (isLikelyFlipCard(fallbackCard)) {
        const genericMatch = rel.match(/^(.*?)(\.[^.]+)$/)
        if (genericMatch) {
          const base = genericMatch[1]
          const ext = genericMatch[2]
          const frontSide = buildSide('front', `${base}-front${ext}`, source.width, source.height)
          const backSide = buildSide('back', `${base}-back${ext}`, source.width, source.height)
          return [frontSide, backSide]
        }
      }
      return [source]
    }
    const fetchSides = (): ImageSideInfo[] => {
      const stmt = db.prepare(
        `SELECT side, rel_path, width, height, sort_order
         FROM card_image_sides
         WHERE card_pk = ?
         ORDER BY sort_order ASC, side ASC`
      )
      stmt.bind([card_pk])
      const sides: ImageSideInfo[] = []
      try {
        while (stmt.step()) {
          const row = stmt.getAsObject() as any
          const sideValue = (row.side ?? '').toString() || `side-${sides.length + 1}`
          const relValue = row.rel_path ?? null
          const widthValue = typeof row.width === 'number' ? row.width : null
          const heightValue = typeof row.height === 'number' ? row.height : null
          sides.push(buildSide(sideValue, relValue, widthValue, heightValue))
        }
      } finally {
        stmt.free()
      }
      return sides
    }
    try {
      if (imageTableModeRef.current !== 'legacy') {
        let sides: ImageSideInfo[] = []
        try {
          sides = fetchSides()
          imageTableModeRef.current = 'split'
        } catch (err) {
          console.warn('card_image_sides lookup failed, falling back to legacy mode', err)
          imageTableModeRef.current = 'legacy'
        }
        if (sides.length > 0) {
          if (sides.length === 1) {
            const expanded = expandFlipSides(sides[0], card)
            if (expanded.length > 1) {
              const primary = expanded[0]
              return { url: primary.url, rel_path: primary.rel_path, sides: expanded }
            }
          }
          const primary = sides[0]
          return { url: primary.url, rel_path: primary.rel_path, sides }
        }
      }

      const stmt = db.prepare(`SELECT rel_path, width, height FROM card_images WHERE card_pk = ? LIMIT 1`)
      stmt.bind([card_pk])
      let rel: string | null = null
      let width: number | null = null
      let height: number | null = null
      if (stmt.step()) {
        const row = stmt.getAsObject() as any
        rel = row.rel_path ?? null
        width = typeof row.width === 'number' ? row.width : null
        height = typeof row.height === 'number' ? row.height : null
      }
      stmt.free()
      const singleSide = buildSide('front', rel, width, height)
      if (!singleSide.url) {
        return { url: null, rel_path: null, sides: [] }
      }
      const derivedSides = expandFlipSides(singleSide, card)
      return { url: derivedSides[0]?.url ?? singleSide.url, rel_path: derivedSides[0]?.rel_path ?? singleSide.rel_path, sides: derivedSides }
    } catch (err) {
      console.warn('Failed to resolve card image', err)
      return { url: null, rel_path: null, sides: [] }
    }
  }, [isLikelyFlipCard])
  const showCardByIndex = useCallback((index: number) => {
    if (!contentDb) return
    if (index < 0 || index >= visibleCards.length) return
    const nextCard = visibleCards[index]
    ensureCardText(nextCard.card_pk)
    const info = getImageInfo(contentDb, nextCard.card_pk, nextCard)
    setImageFor({ card: nextCard, info, index, sideIndex: 0 })
    setInfoOpen(false)
  }, [contentDb, visibleCards, getImageInfo, ensureCardText])
  const openImage = useCallback((card: CardRow) => {
    if (!contentDb) return
    const idx = visibleCards.findIndex(c => c.card_pk === card.card_pk)
    if (idx >= 0) {
      showCardByIndex(idx)
      return
    }
    ensureCardText(card.card_pk)
    const info = getImageInfo(contentDb, card.card_pk, card)
    setImageFor({
      card,
      info,
      index: -1,
      sideIndex: 0
    })
    setInfoOpen(false)
  }, [contentDb, visibleCards, showCardByIndex, ensureCardText, getImageInfo])
  const openCardImageByPk = useCallback((cardPk: number) => {
    if (!cardPk) return
    const card = cardMetaByPk.get(cardPk)
    if (!card) return
    openImage(card)
  }, [cardMetaByPk, openImage])
  const closeImage = useCallback(() => {
    if (!imageFor) return
    setInfoOpen(false)
    if (viewerPushedRef.current && typeof window !== 'undefined') {
      window.history.back()
    } else {
      setImageFor(null)
    }
  }, [imageFor])
  const navigateCard = useCallback((delta: number) => {
    if (!imageFor) return
    if (imageFor.index < 0) return
    const nextIndex = imageFor.index + delta
    showCardByIndex(nextIndex)
  }, [imageFor, showCardByIndex])
  const handleImageSideChange = useCallback((nextIndex: number) => {
    setImageFor((prev) => {
      if (!prev) return prev
      const sides = prev.info.sides
      if (!sides.length) return prev
      const clamped = Math.max(0, Math.min(nextIndex, sides.length - 1))
      if (clamped === prev.sideIndex) return prev
      return { ...prev, sideIndex: clamped }
    })
  }, [])
  const availableImageSides = imageFor ? imageFor.info.sides : []
  const activeImageSide = imageFor ? (availableImageSides[imageFor.sideIndex] ?? availableImageSides[0] ?? null) : null
  const hasMultipleImageSides = availableImageSides.length > 1
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    e.stopPropagation()
    const touch = e.touches[0]
    if (!touch) {
      touchStartPoint.current = null
      return
    }
    touchStartPoint.current = { x: touch.clientX, y: touch.clientY }
  }, [])
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      e.stopPropagation()
      if (infoOpen) {
        touchStartPoint.current = null
        return
      }
      const start = touchStartPoint.current
      touchStartPoint.current = null
      if (!start) return
      const touch = e.changedTouches[0]
      const endX = touch?.clientX ?? start.x
      const endY = touch?.clientY ?? start.y
      const deltaX = endX - start.x
      const deltaY = endY - start.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      const SWIPE_THRESHOLD = 30
      if (absX > absY && absX > SWIPE_THRESHOLD && hasMultipleImageSides && imageFor) {
        const direction = deltaX < 0 ? 1 : -1
        const nextIndex = imageFor.sideIndex + direction
        handleImageSideChange(nextIndex)
        return
      }
      if (absY > absX && absY > SWIPE_THRESHOLD) {
        navigateCard(deltaY > 0 ? -1 : 1)
      }
    },
    [handleImageSideChange, hasMultipleImageSides, imageFor, navigateCard, infoOpen]
  )
  const handleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
    e.stopPropagation()
    if (infoOpen) return
    const now = Date.now()
    if (now - lastWheelTime.current < 200) return
    if (Math.abs(e.deltaY) < 10) return
    navigateCard(e.deltaY > 0 ? 1 : -1)
    lastWheelTime.current = now
    e.preventDefault()
  }, [navigateCard, infoOpen])
  const sideCount = availableImageSides.length
  const handleImageTap = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      if (!hasMultipleImageSides || !imageFor || sideCount <= 1) return
      const nextIndex = (imageFor.sideIndex + 1) % sideCount
      handleImageSideChange(nextIndex)
    },
    [hasMultipleImageSides, imageFor, sideCount, handleImageSideChange]
  )
  useEffect(() => {
    if (!imageFor) return
    if (!visibleCards.length) return
    const idx = visibleCards.findIndex(c => c.card_pk === imageFor.card.card_pk)
    if (idx === -1) return
    if (idx !== imageFor.index) showCardByIndex(idx)
  }, [imageFor, visibleCards, showCardByIndex])
  useEffect(() => {
    if (!imageFor) return
    ensureCardText(imageFor.card.card_pk)
  }, [imageFor, ensureCardText])
  useEffect(() => {
    if (!infoOpen || !imageFor) return
    ensureCardText(imageFor.card.card_pk)
  }, [infoOpen, imageFor, ensureCardText])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = () => {
      if (!viewerPushedRef.current) return
      viewerPushedRef.current = false
      setImageFor(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (imageFor && !viewerPushedRef.current) {
      window.history.pushState({ cardViewer: true }, '')
      viewerPushedRef.current = true
    }
    if (!imageFor) {
      viewerPushedRef.current = false
    }
  }, [imageFor])
  useEffect(() => {
    if (!imageFor) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [imageFor])
  useEffect(() => {
    if (!imageFor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeImage()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateCard(-1)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        navigateCard(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imageFor, closeImage, navigateCard])
  useEffect(() => {
    if (!imageFor) setInfoOpen(false)
  }, [imageFor])

  const handleBackPressRef = useRef<() => boolean>(() => false)

  const handleBackPress = useCallback(() => {
    if (countModal) {
      closeCountModal()
      return true
    }
    if (imageFor) {
      closeImage()
      return true
    }
    if (cardsMenuOpen) {
      setCardsMenuOpen(false)
      return true
    }
    if (moreOpen) {
      setMoreOpen(false)
      return true
    }
    if (statsOpen) {
      handleStatsToggle(false)
      return true
    }
    if (page === 'Teams') {
      if (teamView === 'add') {
        setTeamView('detail')
        return true
      }
      if (teamView === 'detail') {
        setTeamView('list')
        return true
      }
    }
    if (popPage()) {
      return true
    }
    return false
  }, [
    closeCountModal,
    closeImage,
    countModal,
    imageFor,
    setCardsMenuOpen,
    setMoreOpen,
    handleStatsToggle,
    statsOpen,
    cardsMenuOpen,
    moreOpen,
    page,
    teamView,
    setTeamView,
    popPage
  ])

  useEffect(() => {
    handleBackPressRef.current = handleBackPress
  }, [handleBackPress])

  useEffect(() => {
    if (!nativeEnv) return
    let removed = false
    const registerHandler = async () => {
      try {
        const handler = await CapacitorApp.addListener('backButton', () => {
          const handled = handleBackPressRef.current()
          if (!handled) {
            CapacitorApp.exitApp?.()
          }
        })
        return () => {
          if (removed) return
          removed = true
          void handler.remove()
        }
      } catch (err) {
        console.warn('Failed to register backButton listener', err)
        return () => {}
      }
    }

    let cleanup: (() => void) | undefined
    void registerHandler().then(fn => {
      cleanup = fn
    })

    return () => {
      removed = true
      cleanup?.()
    }
  }, [nativeEnv])

  // ---------- Layout ----------
  const navMainPages: Page[] = primaryPages
  const menuPages: Page[] = extraPages
  const menuActive = menuPages.includes(page)

  const contentPadding = isSmallScreen
    ? `0 calc(env(safe-area-inset-right, 0px) + 16px) 40px calc(env(safe-area-inset-left, 0px) + 16px)`
    : `0 calc(env(safe-area-inset-right, 0px) + 20px) 48px calc(env(safe-area-inset-left, 0px) + 20px)`
  const searchBarPadding = isSmallScreen
    ? `16px calc(env(safe-area-inset-right, 0px) + 16px) 10px calc(env(safe-area-inset-left, 0px) + 16px)`
    : `18px calc(env(safe-area-inset-right, 0px) + 20px) 12px calc(env(safe-area-inset-left, 0px) + 20px)`
  const navSpacer = (navHeight || 76) + (isSmallScreen ? 20 : 28)
  const navTopPadding = isSmallScreen ? 12 : 18
  const bottomButtonEdgeSpacing = isSmallScreen ? 12 : 14

  const viewerTopPadding = `calc(env(safe-area-inset-top, 0px) + ${isSmallScreen ? 6 : 10}px)`
  const viewerBottomPadding = `calc(env(safe-area-inset-bottom, 0px) + ${isSmallScreen ? 12 : 16}px)`
  const currentText = imageFor ? cardTextMap[imageFor.card.card_pk] : undefined
  const viewerErrata = !!(imageFor && imageFor.card.has_errata)
  const hasCardText = !!(currentText && nonEmpty(currentText.text_html))
  const hasGlobalText = !!(currentText && nonEmpty(currentText.global_text_html))
  const toolLinks = useMemo(
    () => [
      { label: 'Collection', page: 'Collection' as Page },
      { label: 'Trade Tools', page: 'Trade Tools' as Page },
      { label: 'Keywords', page: 'Keywords' as Page },
      { label: 'Rulings', page: 'Rulings' as Page },
      { label: 'Proxy Dice', page: 'Proxy Dice' as Page },
      { label: 'Life Counter', page: 'Life Counter' as Page },
      { label: 'Glossary', page: 'Glossary' as Page },
      { label: 'Credits & Legal', page: 'Credits' as Page }
    ],
    []
  )

  const searchPageBaseProps: Omit<React.ComponentProps<typeof SearchPage>, 'onSearch'> = {
    isSmallScreen,
    navHeight,
    searchBarPadding,
    bottomButtonEdgeSpacing,
    query: q,
    setQuery: setQ,
    searchMode,
    setSearchMode,
    setGroups,
    selectedGroups,
    setSelectedGroups,
    types,
    typeSel,
    setTypeSel,
    energies,
    energySel,
    setEnergySel,
    energyTokenIconFile,
    iconFileFor,
    costSel,
    setCostSel,
    ownedYes,
    setOwnedYes,
    ownedNo,
    setOwnedNo,
    genders,
    genderSel,
    setGenderSel,
    rarities,
    raritySel,
    setRaritySel,
    universes,
    universeSel,
    setUniverseSel,
    formats,
    formatSel,
    setFormatSel,
    selectedFormat,
    alignList,
    alignSel,
    setAlignSel,
    affList,
    affSel,
    setAffSel,
    resetFilters
  }

  return (
    <div className="app-root" style={themeVars}>
      {/* Sticky top navigation (old styling) */}
      <div ref={navRef} className="app-nav">
        <div
          className="app-nav-inner"
          style={{
            padding: isSmallScreen
              ? `12px calc(env(safe-area-inset-right, 0px) + 16px) 8px calc(env(safe-area-inset-left, 0px) + 16px)`
              : `18px calc(env(safe-area-inset-right, 0px) + 20px) 10px calc(env(safe-area-inset-left, 0px) + 20px)`,
            paddingTop: `calc(${navTopPadding}px + env(safe-area-inset-top, 0px))`,
            gap: isSmallScreen ? 8 : 12,
            rowGap: isSmallScreen ? 8 : 0,
            flexWrap: isSmallScreen ? 'wrap' : 'nowrap',
            minHeight: isSmallScreen ? 60 : 68,
            justifyContent: 'center'
          }}
        >
          {navMainPages.map(p => {
            if (p === 'Search') {
              const classes = ['nav-button', 'nav-button--icon']
              if (isSmallScreen) classes.push('nav-button--compact')
              if (page === p) classes.push('nav-button--active')
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    goToPage(p)
                    if (moreOpen) setMoreOpen(false)
                  }}
                  className={classes.join(' ')}
                  aria-label="Search"
                >
                  <span aria-hidden style={{ fontSize: 18 }}>🔍</span>
                </button>
              )
            }
            return (
              <NavButton
                key={p}
                label={p}
                active={page === p}
                  onClick={() => {
                    goToPage(p)
                    if (moreOpen) setMoreOpen(false)
                  }}
                compact={isSmallScreen}
              />
            )
          })}
          {page === 'Cards' && (
            <div className="nav-cards-menu">
              <button
                type="button"
                ref={cardsMenuBtnRef}
                onClick={() => {
                  if (moreOpen) setMoreOpen(false)
                  if (cardsMenuOpen) {
                    setCardsMenuOpen(false)
                    return
                  }
                  setCardsMenuOpen(true)
                }}
                aria-haspopup="menu"
                aria-expanded={cardsMenuOpen}
                className={['nav-more-button', 'nav-more-button--no-caret', 'nav-cards-button', cardsMenuOpen ? 'nav-more-button--active' : ''].filter(Boolean).join(' ')}
              >
                <span className="nav-more-icon" aria-hidden>☰</span>
              </button>
              {cardsMenuOpen && (
                <>
                  <div
                    onClick={() => setCardsMenuOpen(false)}
                    className="nav-overlay"
                  />
                  <div
                    className="nav-menu nav-menu--cards"
                    style={{
                      top: cardsMenuPos?.top ?? 72,
                      right: cardsMenuPos?.right ?? 16
                    }}
                    ref={cardsMenuRef}
                    role="menu"
                  >
                    <button
                      type="button"
                      className="cards-menu-action"
                      onClick={() => toggleAll(!allOpen, groupKeys)}
                    >
                      {allOpen ? 'Collapse' : 'Expand'}
                    </button>
                    <div className="cards-menu-divider" role="separator" />
                    <label
                      className={['cards-menu-toggle', massMode === 'plus' ? 'cards-menu-toggle--checked' : ''].filter(Boolean).join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={massMode === 'plus'}
                        onChange={() => handleMassModeSelect('plus')}
                      />
                      <span>Mass add</span>
                    </label>
                    <label
                      className={['cards-menu-toggle', massMode === 'minus' ? 'cards-menu-toggle--checked' : ''].filter(Boolean).join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={massMode === 'minus'}
                        onChange={() => handleMassModeSelect('minus')}
                      />
                      <span>Mass remove</span>
                    </label>
                    <div className="cards-menu-divider" role="separator" />
                    <label
                      className={['cards-menu-toggle', diceLinkMode === 'd1' ? 'cards-menu-toggle--checked' : ''].filter(Boolean).join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={diceLinkMode === 'd1'}
                        onChange={() => handleDiceModeSelect('d1')}
                      />
                      <span>Add dice 1</span>
                    </label>
                    <label
                      className={['cards-menu-toggle', diceLinkMode === 'd2' ? 'cards-menu-toggle--checked' : ''].filter(Boolean).join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={diceLinkMode === 'd2'}
                        onChange={() => handleDiceModeSelect('d2')}
                      />
                      <span>Add dice 2</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
          {canInstallPwa && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="nav-button nav-button--install"
            >
              Install App
            </button>
          )}
          {!canInstallPwa && installUnavailableReason && (
            <span className="nav-install-hint">{installUnavailableReason}</span>
          )}
          {menuPages.length > 0 && (
            <div className="nav-more">
              <button
                ref={moreBtnRef}
                onClick={() => setMoreOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={['nav-more-button', menuActive ? 'nav-more-button--active' : ''].filter(Boolean).join(' ')}
              >
                <span className="nav-more-icon" aria-hidden>☰</span>
              </button>
              {moreOpen && (
                <>
                  <div
                    onClick={() => setMoreOpen(false)}
                    className="nav-overlay"
                  />
                  <div
                    className="nav-menu"
                    style={{
                      top: morePos?.top ?? 72,
                      right: morePos?.right ?? 16
                    }}
                    ref={moreMenuRef}
                    role="menu"
                  >
                    {menuPages.map(p => (
                      <button
                        key={p}
                        role="menuitem"
                        onClick={() => {
                          goToPage(p)
                          setMoreOpen(false)
                        }}
                        className={['nav-menu-button', page === p ? 'nav-menu-button--active' : ''].filter(Boolean).join(' ')}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          width: '100%',
          padding: contentPadding,
          paddingTop: `calc(${navSpacer}px + env(safe-area-inset-top, 0px))`,
          maxWidth: 1200,
          margin: '0 auto',
          boxSizing: 'border-box'
        }}
      >

        {/* SEARCH PAGE */}
        {page === 'Search' && (
          <SearchPage
            {...searchPageBaseProps}
            onSearch={() => goToPage('Cards')}
          />
        )}

        {/* TOOLS PAGE */}
        {page === 'Tools' && (
          <Suspense fallback={<div className="page-fallback">Loading tools…</div>}>
            <ToolsPage
              links={toolLinks}
              onNavigate={handleToolsNavigate}
              totalOfflineImages={totalOfflineImages}
              imageCacheStatus={imageCacheStatus}
              imageCacheProgress={imageCacheProgress}
              imageCacheMessage={imageCacheMessage}
              onDownloadImages={handleDownloadImages}
            />
          </Suspense>
        )}

        {/* TRADE TOOLS PAGE */}
        {page === 'Trade Tools' && (
          <Suspense fallback={<div className="page-fallback">Loading trade tools…</div>}>
            <TradeToolsPage
              ready={ready}
              tradeKeepBoth={tradeKeepBoth}
              onTradeKeepBothChange={handleTradeKeepBothChange}
              onExportTrades={handleExportTrades}
              onImportTradesClick={handleTradeImportClick}
              tradeImporting={tradeImporting}
              tradeImportError={tradeImportError}
              tradeResult={tradeResult}
              tradeFileInputRef={tradeFileInputRef}
              onImportTradesFile={handleTradeImportFile}
              onOpenCardImage={openCardImageByPk}
            />
          </Suspense>
        )}

        {/* CARDS PAGE */}
        {page === 'Cards' && (
          <Suspense
            fallback={(
              <div className="cards-grid">
                <div className="cards-empty">Loading cards…</div>
              </div>
            )}
          >
            <CardsPage
              groups={groups}
              openKeys={openKeys}
              allOpen={allOpen}
              setOpenKeys={setOpenKeys}
              diceKey={diceKey}
              diceGet={diceGet}
              diceInc={diceInc}
              massMode={massMode}
              setCountModal={setCountModal}
              haveCards={haveCards}
              haveFoil={haveFoil}
              applyCardDelta={applyCardDelta}
              isBasic={isBasic}
              parseEnergyTokens={parseEnergyTokens}
              energyTokenIconFile={energyTokenIconFile}
              iconFileFor={iconFileFor}
              energyCodeMap={energyCodeMap}
              openImage={openImage}
              nonEmpty={nonEmpty}
            />
          </Suspense>
        )}

        {/* COLLECTION PAGE */}
        {page === 'Collection' && (
          <Suspense fallback={<div className="page-fallback">Loading collection…</div>}>
            <CollectionPage
              ready={ready}
              onBackupDb={handleBackupDb}
              onImportBackupClick={handleImportBackupClick}
              backupImporting={backupImporting}
              backupImportError={backupImportError}
              backupFileInputRef={backupFileInputRef}
              onImportBackupFile={handleImportBackupFile}
              onExportCollection={handleExportCollection}
              onImportClick={handleImportClick}
              importing={importing}
              importError={importError}
              importReport={importReport}
              fileInputRef={fileInputRef}
              onImportFile={handleImportFile}
              statsOpen={statsOpen}
              statsLoading={statsLoading}
              statsError={statsError}
              statsData={statsData}
              onToggleStats={handleStatsToggle}
            />
          </Suspense>
        )}

        {/* GLOSSARY PAGE */}
        {page === 'Glossary' && (
          <Suspense fallback={<div className="page-fallback">Loading glossary…</div>}>
            <GlossaryPage />
          </Suspense>
        )}

        {/* CREDITS PAGE */}
        {page === 'Credits' && (
          <Suspense fallback={<div className="page-fallback">Loading credits…</div>}>
            <CreditsPage />
          </Suspense>
        )}

        {/* KEYWORDS PAGE */}
        {page === 'Keywords' && (
          <Suspense fallback={<div className="page-fallback">Loading keywords…</div>}>
            <KeywordsPage />
          </Suspense>
        )}

        {/* TEAMS PAGE */}
        {page === 'Teams' && (
          <Suspense fallback={<div className="page-fallback">Loading teams…</div>}>
            {(() => {
              if (teamView === 'list') {
                return (
                  <TeamsListPage
                    teams={teamSummaries}
                    onCreateTeam={createTeam}
                    onRenameTeam={renameTeam}
                    onDeleteTeam={deleteTeam}
                    onOpenTeam={(teamId) => {
                      setSelectedTeamId(teamId)
                      setTeamView('detail')
                    }}
                  />
                )
              }

              const selectedTeam = teamSummaries.find(t => t.team.team_id === selectedTeamId)
              if (!selectedTeam) {
                return <div className="team-detail-empty">Select or create a team to continue.</div>
              }

              if (teamView === 'detail') {
                return (
                  <TeamDetailPage
                    team={selectedTeam.team}
                    diceTotal={selectedTeam.diceTotal}
                    diceLimit={TEAM_MAX_DICE}
                    cards={selectedTeamCards}
                    onBack={() => setTeamView('list')}
                    onAddCards={() => setTeamView('add')}
                    onEditDice={(info) => openTeamDiceModal(selectedTeam.team.team_id, info.row, info.diceCount)}
                    onRemoveCard={(cardPk) => removeCardFromTeam(selectedTeam.team.team_id, cardPk)}
                    isBasic={isBasic}
                    parseEnergyTokens={parseEnergyTokens}
                    energyTokenIconFile={energyTokenIconFile}
                    iconFileFor={iconFileFor}
                    nonEmpty={nonEmpty}
                    onOpenCard={openImage}
                  />
                )
              }

              if (teamView === 'add') {
                return (
                  <TeamAddPage
                    team={selectedTeam.team}
                    diceTotal={selectedTeam.diceTotal}
                    diceLimit={TEAM_MAX_DICE}
                    filteredRows={filteredRows}
                    isBasic={isBasic}
                    parseEnergyTokens={parseEnergyTokens}
                    energyTokenIconFile={energyTokenIconFile}
                    iconFileFor={iconFileFor}
                    nonEmpty={nonEmpty}
                    onBack={() => setTeamView('detail')}
                    onAddCard={handleTeamAddCard}
                    isCardAdded={(cardPk) => selectedTeamCardSet.has(cardPk)}
                    onOpenCard={openImage}
                    searchProps={searchPageBaseProps}
                  />
                )
              }

              return null
            })()}
          </Suspense>
        )}

        {page === 'Life Counter' && (
          <Suspense fallback={<div className="page-fallback">Loading life counter…</div>}>
            <LifeCounterPage />
          </Suspense>
        )}

        {page === 'Proxy Dice' && (
          <Suspense fallback={<div className="page-fallback">Loading proxy dice…</div>}>
            <ProxyDicePage
              cards={proxyDiceCards}
              isSmallScreen={isSmallScreen}
            />
          </Suspense>
        )}

        {page === 'Rulings' && (
          <Suspense fallback={<div className="page-fallback">Loading rulings…</div>}>
            <RulingsPage />
          </Suspense>
        )}
      </div>

      {countModal && (
        <div onClick={closeCountModal} className="modal-overlay">
          <div onClick={(e) => e.stopPropagation()} className="modal-container">
            <div className="modal-heading">
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.2 }}>{countModal.title}</span>
              {countModal.subtitle && (
                <span style={{ fontSize: 14, color: THEME_TEXT_MUTED }}>{countModal.subtitle}</span>
              )}
            </div>

            <div className="modal-stepper">
              <button
                type="button"
                onClick={() => bumpCountModal(-1)}
                disabled={countModal.value <= 0}
                className="modal-step-button"
                style={
                  countModal.value <= 0
                    ? {
                        border: '1px solid #cbd5f5',
                        background: '#e2e8f025',
                        color: THEME_TEXT_MUTED
                      }
                    : undefined
                }
              >
                -
              </button>
              <span className="modal-count-value">{countModal.value}</span>
              <button
                type="button"
                onClick={() => bumpCountModal(+1)}
                className="modal-step-button"
              >
                +
              </button>
            </div>

            {countModal.kind === 'team-dice' && (
              <div style={{ fontSize: 12, color: THEME_TEXT_MUTED, textAlign: 'center', marginTop: 8 }}>
                {`Card max ${countModal.maxDice} · Owned ${countModal.ownedDice} · Team remaining ${countModal.teamRemaining}`}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                onClick={confirmCountModal}
                className="modal-button modal-button--ok"
              >
                <span aria-hidden className="inline-icon" style={{ justifyContent: 'center', width: 18, height: 18 }}>
                  ✓
                </span>
                OK
              </button>
              <button
                type="button"
                onClick={closeCountModal}
                className="modal-button modal-button--cancel"
              >
                <span aria-hidden className="inline-icon" style={{ justifyContent: 'center', width: 18, height: 18 }}>
                  ✕
                </span>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Image Viewer */}
      {imageFor && (
        <div
          onClick={closeImage}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            background: 'linear-gradient(180deg, rgba(248,250,252,0.95) 0%, rgba(226,232,240,0.9) 100%)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            paddingTop: viewerTopPadding,
            paddingBottom: viewerBottomPadding
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              padding: '12px 16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              color: '#f8fafc'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
              <span className="card-viewer-actions">
                {hasMultipleImageSides && (
                  <div className="card-viewer-side-toggle-group">
                    {availableImageSides.map((side, idx) => (
                      <button
                        key={`${side.side}-${idx}`}
                        type="button"
                        onClick={() => handleImageSideChange(idx)}
                        className={`card-viewer-side-toggle${idx === imageFor.sideIndex ? ' card-viewer-side-toggle--active' : ''}`}
                        disabled={idx === imageFor.sideIndex}
                      >
                        {side.label}
                      </button>
                    ))}
                  </div>
                )}
                {imageFor.card.card_number != null && (
                  <span className="card-viewer-card-number">
                    #{imageFor.card.card_number}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setInfoOpen(prev => !prev)}
                  className={`card-viewer-info-button${infoOpen && !viewerErrata ? ' card-viewer-info-button--active' : ''}${viewerErrata ? ' card-viewer-info-button--errata' : ''}`}
                  aria-label="Toggle card text"
                >
                  i
                </button>
                <button
                  type="button"
                  onClick={closeImage}
                  className="card-viewer-close-button"
                >
                  Close
                </button>
              </span>
            </div>

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              onClick={handleImageTap}
              style={{
                flex: '1 1 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 0',
                overflow: 'hidden'
              }}
            >
              {activeImageSide?.url || imageFor.info.url ? (
                <img
                  src={activeImageSide?.url ?? imageFor.info.url ?? undefined}
                  alt={
                    (() => {
                      const base = imageFor.card.card_name || imageFor.card.character_name || ''
                      if (!activeImageSide?.label || !base) return base
                      return `${base} (${activeImageSide.label})`
                    })()
                  }
                  style={{
                    width: 'min(100vw, 520px)',
                    maxHeight: `calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${infoOpen ? 260 : 120}px)`,
                    objectFit: 'contain',
                    borderRadius: 12,
                    boxShadow: '0 20px 40px rgba(15,23,42,0.18)'
                  }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div style={{ padding: 20, textAlign: 'center', opacity: 0.7 }}>
                  No image registered for card_pk {imageFor.card.card_pk}.
                </div>
              )}
            </div>

            {infoOpen && (
              <div style={{ background: '#ebebeb', border: '1px solid rgba(30,41,59,0.1)', borderRadius: 12, padding: 16, maxHeight: '40vh', overflowY: 'auto', color: '#1f2937', fontSize: 16, fontWeight: 600, lineHeight: 1.55 }}>
                {!currentText ? (
                  <div style={{ opacity: 0.7 }}>Loading card text…</div>
                ) : (
                  <>
                    {hasCardText && (
                      <div dangerouslySetInnerHTML={{ __html: currentText.text_html ?? '' }} />
                    )}
                    {hasGlobalText && (
                      <div style={{ marginTop: hasCardText ? 12 : 0 }} dangerouslySetInnerHTML={{ __html: currentText.global_text_html ?? '' }} />
                    )}
                    {!hasCardText && !hasGlobalText && (
                      <div style={{ opacity: 0.7 }}>No rules text available.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
