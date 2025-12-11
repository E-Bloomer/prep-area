import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

const NO_AFFILIATION_TOKEN = 'NONE'
const NO_AFFILIATION_LABEL = 'No Affiliation'
const MANUAL_AFFILIATION_COMPOSITES = { '46': ['4', '6'] }
const HIDDEN_AFFILIATION_TOKENS = new Set(['4', '6'])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dbPath = path.resolve(rootDir, 'public', 'content.sqlite')
const wasmPath = path.resolve(rootDir, 'node_modules', 'sql.js', 'dist')
const outputDir = path.resolve(rootDir, 'src', 'generated')
const outputPath = path.join(outputDir, 'filterData.json')

const nonEmpty = (value) => value != null && String(value).trim() !== ''

const normalizeEnergyToken = (token) => {
  if (!token) return null
  const upper = String(token).trim().toUpperCase()
  return upper || null
}

const parseEnergyTokens = (csv) => {
  if (!csv) return []
  const seen = new Set()
  const tokens = []
  for (const part of String(csv).split(',')) {
    const norm = normalizeEnergyToken(part)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      tokens.push(norm)
    }
  }
  return tokens
}

const energyCodeRank = (code) => {
  if (!code) return 999
  const norm = String(code).trim().toUpperCase()
  if (!norm) return 999
  const numeric = Number(norm)
  if (!Number.isNaN(numeric)) return numeric
  const char = norm.charCodeAt(0)
  if (char >= 65 && char <= 90) return 10 + (char - 65)
  return 999
}

const genderLabel = (value) => {
  if (value == null) return ''
  const str = String(value).trim()
  if (str === '0') return 'Male'
  if (str === '1') return 'Female'
  if (str === '2') return 'Other'
  return str
}

const runQuery = (db, sql, params = []) => {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const main = async () => {
  if (!fs.existsSync(dbPath)) {
    console.error(`[generate-filter-data] Missing database at ${dbPath}`)
    process.exit(1)
  }

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(wasmPath, file)
  })

  const dbBytes = fs.readFileSync(dbPath)
  const db = new SQL.Database(dbBytes)

  const setGroups = runQuery(db, `
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
    ),
    ranked AS (
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
    .map((row) => {
      const group = String(row.group_key || 'Other')
      const display = String(row.display_label || group)
      const hover = String(row.hover_label || display)
      return { group, display, hover }
    })
    .filter(({ group }) => group.replace(/\s+/g, '').toLowerCase() !== 'sk2017')

  const universes = runQuery(db, `
    SELECT DISTINCT s.universe FROM sets s
    WHERE s.universe IS NOT NULL AND s.universe <> ''
    ORDER BY s.universe
  `).map((row) => String(row.universe))

  const energyRows = runQuery(db, `
    SELECT energy_code, energy_tokens FROM card_rows
    WHERE energy_tokens IS NOT NULL AND energy_tokens <> ''
  `)
  const energyTokens = new Set()
  const tokenRanks = new Map()
  for (const row of energyRows) {
    const rowTokens = parseEnergyTokens(row.energy_tokens)
    if (!rowTokens.length) continue
    const rank = energyCodeRank(row.energy_code)
    for (const token of rowTokens) {
      energyTokens.add(token)
      const current = tokenRanks.get(token)
      if (current == null || rank < current) {
        tokenRanks.set(token, rank)
      }
    }
  }
  const energies = Array.from(energyTokens)
    .map((token) => ({ token, rank: tokenRanks.get(token) ?? 999 }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.token.localeCompare(b.token)
    })
    .map(({ token }) => token)

  const rarities = runQuery(db, `
    SELECT rarity, MIN(COALESCE(rarity_rank, 9999)) AS rarity_rank
    FROM card_rows
    WHERE rarity IS NOT NULL AND rarity <> ''
    GROUP BY rarity
    ORDER BY rarity_rank, rarity
  `)
    .map((row) => String(row.rarity))
    .filter(nonEmpty)

  const types = runQuery(db, `
    SELECT DISTINCT type_name FROM card_rows
    WHERE type_name IS NOT NULL AND type_name <> ''
    ORDER BY type_name
  `).map((row) => String(row.type_name))

  const genderRows = runQuery(db, `
    SELECT DISTINCT gender FROM card_rows
    WHERE gender IS NOT NULL AND gender <> ''
    ORDER BY gender
  `)
  const genderSet = new Set()
  for (const row of genderRows) {
    const label = genderLabel(row.gender)
    if (nonEmpty(label)) {
      genderSet.add(label)
    }
  }
  const genders = Array.from(genderSet.values())

  const formatRows = runQuery(db, `
    SELECT format_id, code, name, notes
    FROM formats
    ORDER BY name
  `)
  const formats = []
  const formatBansMap = new Map()
  const ensureFormat = (id) => {
    if (!formatBansMap.has(id)) {
      formatBansMap.set(id, { sets: new Set(), cards: new Set() })
    }
    return formatBansMap.get(id)
  }
  for (const row of formatRows) {
    const id = Number(row.format_id)
    formats.push({
      id,
      code: row.code != null && row.code !== '' ? String(row.code) : null,
      name: String(row.name),
      notes: row.notes != null ? String(row.notes) : null
    })
    ensureFormat(id)
  }

  runQuery(db, `SELECT format_id, set_id FROM format_banned_sets`).forEach((row) => {
    const id = Number(row.format_id)
    const setId = Number(row.set_id)
    if (Number.isFinite(id) && Number.isFinite(setId)) {
      ensureFormat(id).sets.add(setId)
    }
  })

  runQuery(db, `SELECT format_id, card_pk FROM format_banned_cards`).forEach((row) => {
    const id = Number(row.format_id)
    const cardPk = Number(row.card_pk)
    if (Number.isFinite(id) && Number.isFinite(cardPk)) {
      ensureFormat(id).cards.add(cardPk)
    }
  })

  const activeFormats = formats.filter((format) => {
    const entry = formatBansMap.get(format.id)
    return entry && (entry.sets.size > 0 || entry.cards.size > 0)
  })
  const formatBans = activeFormats.map((format) => {
    const entry = formatBansMap.get(format.id)
    return {
      id: format.id,
      sets: Array.from(entry?.sets ?? []),
      cards: Array.from(entry?.cards ?? [])
    }
  })

  const alignments = runQuery(db, `
    SELECT token, name FROM alignments ORDER BY name
  `).map((row) => ({
    token: String(row.token),
    name: String(row.name)
  }))

  const tokenIcons = runQuery(db, `
    SELECT token, file, alt FROM token_icons
  `)
    .map((row) => ({
      token: String(row.token ?? ''),
      file: String(row.file ?? ''),
      alt: row.alt != null ? String(row.alt) : null
    }))
    .filter(({ token, file }) => nonEmpty(token) && nonEmpty(file))

  const energyCodes = runQuery(db, `
    SELECT code, file, alt FROM energy_codes
  `)
    .map((row) => ({
      code: String(row.code ?? ''),
      file: row.file != null ? String(row.file) : null,
      alt: row.alt != null ? String(row.alt) : null
    }))
    .filter(({ code }) => nonEmpty(code))

  const affiliationRows = runQuery(db, `
    SELECT token, file, alt, COALESCE(is_composite, 0) AS is_composite, components
    FROM affiliation_icons
    ORDER BY token
  `)

  const parseComponents = (raw) =>
    String(raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(nonEmpty)

  const componentMap = new Map()
  for (const row of affiliationRows) {
    const baseToken = String(row.token ?? '')
    const normalizedToken = baseToken === '0' ? NO_AFFILIATION_TOKEN : baseToken
    componentMap.set(normalizedToken, parseComponents(row.components))
  }
  for (const [token, parts] of Object.entries(MANUAL_AFFILIATION_COMPOSITES)) {
    componentMap.set(token, parts)
  }

  const displayAffiliations = []
  let hasNoAffiliation = false

  for (const row of affiliationRows) {
    const baseToken = String(row.token ?? '')
    const normalizedToken = baseToken === '0' ? NO_AFFILIATION_TOKEN : baseToken
    const include =
      (!HIDDEN_AFFILIATION_TOKENS.has(baseToken) && Number(row.is_composite) === 0) ||
      MANUAL_AFFILIATION_COMPOSITES[baseToken] != null

    if (!include) continue
    const entry = {
      token: normalizedToken,
      file: String(row.file ?? ''),
      alt: row.alt != null ? String(row.alt) : null,
      is_composite: Number(row.is_composite) || 0,
      components: row.components != null ? String(row.components) : null
    }
    if (normalizedToken === NO_AFFILIATION_TOKEN) {
      entry.alt = NO_AFFILIATION_LABEL
      entry.file = entry.file || 'a0.png'
      hasNoAffiliation = true
    }
    displayAffiliations.push(entry)
  }

  for (const [token, parts] of Object.entries(MANUAL_AFFILIATION_COMPOSITES)) {
    if (!displayAffiliations.some((row) => row.token === token)) {
      const base = affiliationRows.find((row) => String(row.token ?? '') === token)
      if (base) {
        displayAffiliations.push({
          token,
          file: String(base.file ?? ''),
          alt: base.alt != null ? String(base.alt) : null,
          is_composite: Number(base.is_composite) || 0,
          components: base.components != null ? String(base.components) : null
        })
      } else {
        displayAffiliations.push({
          token,
          file: '',
          alt: null,
          is_composite: 0,
          components: parts.join(',')
        })
      }
    }
  }

  if (!componentMap.has(NO_AFFILIATION_TOKEN)) {
    componentMap.set(NO_AFFILIATION_TOKEN, [])
  }
  if (!hasNoAffiliation) {
    displayAffiliations.unshift({
      token: NO_AFFILIATION_TOKEN,
      file: 'a0.png',
      alt: NO_AFFILIATION_LABEL,
      is_composite: 0,
      components: null
    })
  }

  const expandAffiliation = (token, trail = new Set()) => {
    if (trail.has(token)) return new Set([token])
    const nextTrail = new Set(trail)
    nextTrail.add(token)
    const set = new Set([token])
    const components = componentMap.get(token) ?? []
    for (const child of components) {
      const expanded = expandAffiliation(child, nextTrail)
      expanded.forEach((value) => set.add(value))
    }
    return set
  }

  const affiliationExpansion = []
  componentMap.forEach((_components, token) => {
    const expanded = expandAffiliation(token)
    affiliationExpansion.push({
      token,
      tokens: Array.from(expanded)
    })
  })

  const seenAffiliations = new Set()
  const uniqueAffiliations = displayAffiliations.filter((row) => {
    if (seenAffiliations.has(row.token)) return false
    seenAffiliations.add(row.token)
    return true
  })

  const data = {
    setGroups,
    universes,
    energies,
    rarities,
    types,
    genders,
    formats: activeFormats,
    formatBans,
    alignments,
    affiliations: uniqueAffiliations,
    affiliationExpansion,
    tokenIcons,
    energyCodes
  }

  ensureDir(outputDir)
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`)
  console.log(`[generate-filter-data] Wrote static filters to ${path.relative(rootDir, outputPath)}`)
}

main().catch((err) => {
  console.error('[generate-filter-data] Failed:', err)
  process.exit(1)
})
