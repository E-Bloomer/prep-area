import React from 'react'
import { AffIconImg, TokenIconImg } from '../components/IconImages'
import { AlignOpt, AffIcon, FormatOpt } from '../types/models'
import { THEME_BORDER, THEME_SURFACE, THEME_TEXT } from '../constants/theme'

type SetGroupOption = { group: string; display: string; hover: string }

export type SearchMode = 'name' | 'text' | 'global'

type SearchPageProps = {
  isSmallScreen: boolean
  navHeight: number
  searchBarPadding: string
  bottomButtonEdgeSpacing: number
  query: string
  searchMode: SearchMode
  setSearchMode: React.Dispatch<React.SetStateAction<SearchMode>>
  setQuery: React.Dispatch<React.SetStateAction<string>>
  setGroups: SetGroupOption[]
  selectedGroups: string[]
  setSelectedGroups: React.Dispatch<React.SetStateAction<string[]>>
  types: string[]
  typeSel: string[]
  setTypeSel: React.Dispatch<React.SetStateAction<string[]>>
  energies: string[]
  energySel: string[]
  setEnergySel: React.Dispatch<React.SetStateAction<string[]>>
  energyTokenIconFile: (token?: string | null) => string | null
  iconFileFor: (token: string) => string | null
  costSel: number[]
  setCostSel: React.Dispatch<React.SetStateAction<number[]>>
  ownedYes: boolean
  setOwnedYes: React.Dispatch<React.SetStateAction<boolean>>
  ownedNo: boolean
  setOwnedNo: React.Dispatch<React.SetStateAction<boolean>>
  genders: string[]
  genderSel: string[]
  setGenderSel: React.Dispatch<React.SetStateAction<string[]>>
  rarities: string[]
  raritySel: string[]
  setRaritySel: React.Dispatch<React.SetStateAction<string[]>>
  universes: string[]
  universeSel: string[]
  setUniverseSel: React.Dispatch<React.SetStateAction<string[]>>
  formats: FormatOpt[]
  formatSel: number | null
  setFormatSel: React.Dispatch<React.SetStateAction<number | null>>
  selectedFormat: FormatOpt | null
  alignList: AlignOpt[]
  alignSel: string[]
  setAlignSel: React.Dispatch<React.SetStateAction<string[]>>
  affList: AffIcon[]
  affSel: string[]
  setAffSel: React.Dispatch<React.SetStateAction<string[]>>
  resetFilters: () => void
  onSearch: () => void
}

export function SearchPage({
  isSmallScreen,
  navHeight,
  searchBarPadding,
  bottomButtonEdgeSpacing,
  query,
  searchMode,
  setSearchMode,
  setQuery,
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
  resetFilters,
  onSearch
}: SearchPageProps) {
  const modeTitles: Record<SearchMode, string> = {
    name: 'Names (character & card)',
    text: 'Card text',
    global: 'Global text'
  }
  const modePlaceholders: Record<SearchMode, string> = {
    name: 'Search character/card name…',
    text: 'Search card text',
    global: 'Search global text'
  }
  const cycleSearchMode = () => {
    setSearchMode(prev => (prev === 'name' ? 'text' : prev === 'text' ? 'global' : 'name'))
  }
  const modeLabel = searchMode === 'name' ? 'N' : searchMode === 'text' ? 'T' : 'G'
  const modeClass = ['search-toggle', `search-toggle--${searchMode}`].join(' ')

  return (
    <div
      className="cards-grid"
      style={{
        padding: isSmallScreen ? '0 4px' : 0,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)'
      }}
    >
      <div
        className="search-sticky"
        style={{
          top: `calc(${navHeight || 76}px + env(safe-area-inset-top, 0px))`,
          padding: searchBarPadding
        }}
      >
        <div className="search-input-wrapper">
          <input
            type="search"
            enterKeyHint="search"
            placeholder={modePlaceholders[searchMode]}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            className="search-input"
          />
          <button
            type="button"
            className={modeClass}
            onClick={cycleSearchMode}
            aria-label={`Search mode: ${modeTitles[searchMode]}. Click to switch.`}
            title={`Search mode: ${modeTitles[searchMode]}`}
          >
            <span aria-hidden>{modeLabel}</span>
          </button>
        </div>
      </div>

      <section>
        <div className="section-title">Sets</div>
        <div className="filter-list">
          {setGroups.map(({ group, display, hover }) => {
            const checked = selectedGroups.includes(group)
            return (
              <label
                key={group}
                title={hover}
                className="filter-chip filter-chip--tight"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setSelectedGroups(prev => e.target.checked ? [...prev, group] : prev.filter(g => g !== group))}
                />
                <span>{display}</span>
              </label>
            )
          })}
        </div>
      </section>

      {types.length > 0 && (
        <section>
          <div className="section-title">Type</div>
          <div className="filter-list">
            {types.map((t) => {
              const checked = typeSel.includes(t)
              return (
                <label key={t} className="filter-chip">
                  <input type="checkbox" checked={checked} onChange={(e)=>setTypeSel(prev=> e.target.checked ? [...prev, t] : prev.filter(x=>x!==t))} />
                  <span>{t}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="section-title">Energy</div>
        <div className="filter-list">
          {energies.map((tok) => {
            const checked = energySel.includes(tok)
            const iconFile = energyTokenIconFile(tok) ?? iconFileFor(tok)
            return (
              <label
                key={tok}
                className="filter-chip filter-chip--tight"
                title={tok}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={tok}
                  onChange={(ev)=>setEnergySel(prev=> ev.target.checked ? [...prev, tok] : prev.filter(x=>x!==tok))}
                />
                <span className="inline-icon">
                  <TokenIconImg token={tok} label={tok} file={iconFile} />
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <div className="section-title">Cost</div>
        <div className="filter-list">
          {[...Array(13)].map((_, n) => {
            const checked = costSel.includes(n)
            return (
              <label key={n} className="filter-chip" style={{ justifyContent: 'center' }}>
                <input type="checkbox" checked={checked} onChange={(e)=>setCostSel(prev=> e.target.checked ? [...prev, n] : prev.filter(x=>x!==n))} />
                <span>{n}</span>
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <div className="section-title">Collection</div>
        <div className="filter-list" style={{ gap: 12 }}>
          <label className="filter-chip">
            <input type="checkbox" checked={ownedYes} onChange={(e)=>setOwnedYes(e.target.checked)} />
            <span>Owned</span>
          </label>
          <label className="filter-chip">
            <input type="checkbox" checked={ownedNo} onChange={(e)=>setOwnedNo(e.target.checked)} />
            <span>Not Owned</span>
          </label>
        </div>
      </section>

      {genders.length > 0 && (
        <section>
          <div className="section-title">Gender</div>
          <div className="filter-list">
            {genders.map((g) => {
              const checked = genderSel.includes(g)
              return (
                <label key={g} className="filter-chip">
                  <input type="checkbox" checked={checked} onChange={(e)=>setGenderSel(prev=> e.target.checked ? [...prev, g] : prev.filter(x=>x!==g))} />
                  <span>{g}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {rarities.length > 0 && (
        <section>
          <div className="section-title">Rarity</div>
          <div className="filter-list">
            {rarities.map((r) => {
              const checked = raritySel.includes(r)
              return (
                <label key={r} className="filter-chip">
                  <input type="checkbox" checked={checked} onChange={(ev)=>setRaritySel(prev=> ev.target.checked ? [...prev, r] : prev.filter(x=>x!==r))} />
                  <span>{r}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {universes.length > 0 && (
        <section>
          <div className="section-title">Universe</div>
          <div className="filter-list">
            {universes.map((u) => {
              const checked = universeSel.includes(u)
              return (
                <label key={u} className="filter-chip">
                  <input type="checkbox" checked={checked} onChange={(ev)=>setUniverseSel(prev=> ev.target.checked ? [...prev, u] : prev.filter(x=>x!==u))} />
                  <span>{u}</span>
                </label>
              )
            })}
          </div>
        </section>
      )}

      {formats.length > 0 && (
        <section>
          <div className="section-title">Formats</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
            <select
              value={formatSel != null ? String(formatSel) : ''}
              onChange={(e) => {
                const val = e.target.value
                setFormatSel(val ? Number(val) : null)
              }}
              style={{ padding: '10px 12px', border: `1px solid ${THEME_BORDER}`, borderRadius: 10, background: THEME_SURFACE, color: THEME_TEXT }}
            >
              <option value="">All formats</option>
              {formats.map((fmt) => (
                <option key={fmt.id} value={String(fmt.id)}>
                  {fmt.name}
                </option>
              ))}
            </select>
            {selectedFormat?.notes && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {selectedFormat.notes}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="section-title">Alignments</div>
        <div className="filter-list">
          {alignList.map((al) => {
            const checked = alignSel.includes(al.token)
            const iconFile = iconFileFor(al.token)
            return (
              <label
                key={al.token}
                className="filter-chip filter-chip--tight"
                title={al.name}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={al.name}
                  onChange={(e)=>setAlignSel(prev=> e.target.checked ? [...prev, al.token] : prev.filter(x=>x!==al.token))}
                />
                <span className="inline-icon">
                  <TokenIconImg token={al.token} label={al.name} file={iconFile} />
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section>
        <div className="section-title">Affiliations</div>
        <div className="filter-list">
          {affList.map((a) => {
            const checked = affSel.includes(a.token)
            const name = a.alt || a.token
            return (
              <label
                key={a.token}
                className="filter-chip filter-chip--tight"
                title={name}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={name}
                  onChange={(e)=>setAffSel(prev=> e.target.checked ? [...prev, a.token] : prev.filter(x=>x!==a.token))}
                />
                <span className="inline-icon" style={{ gap: 6 }}>
                  <AffIconImg token={a.token} label={name} />
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <div
        className="floating-actions"
        style={{
          padding: `16px calc(env(safe-area-inset-right, 0px) + 18px) calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 18px)`,
          justifyContent: isSmallScreen ? 'center' : 'space-evenly',
          gap: isSmallScreen ? 10 : 12
        }}
      >
        <button
          type="button"
          onClick={resetFilters}
          className="floating-button floating-button--primary"
          style={{
            minWidth: isSmallScreen ? 0 : 160,
            flex: isSmallScreen ? 1 : undefined,
            marginLeft: isSmallScreen ? bottomButtonEdgeSpacing : 0
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="floating-button floating-button--primary"
          style={{
            padding: '10px 22px',
            minWidth: isSmallScreen ? 0 : 180,
            flex: isSmallScreen ? 1 : undefined,
            marginRight: bottomButtonEdgeSpacing
          }}
        >
          Search
        </button>
      </div>
    </div>
  )
}
