import React from 'react'
import { CardRow, CountModalState } from '../types/models'
import { AffIconImg, TokenIconImg } from '../components/IconImages'
import { CountButton } from '../components/Buttons'
import { NO_AFFILIATION_TOKEN } from '../constants/assets'

type Group = { title: string; key: string; isBA: boolean; items: CardRow[]; character: string; groupLabel: string }

type CardsPageProps = {
  groups: Group[]
  openKeys: Record<string, boolean>
  allOpen: boolean
  setOpenKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  diceKey: (character: string, groupLabel: string) => string
  diceGet: (character: string, groupLabel: string) => number
  diceInc: (character: string, groupLabel: string, delta: number) => void
  massMode: 'none' | 'plus' | 'minus'
  setCountModal: React.Dispatch<React.SetStateAction<CountModalState | null>>
  haveCards: (cardPk: number) => number
  haveFoil: (cardPk: number) => number
  applyCardDelta: (cardPk: number, character: string, groupLabel: string, delta: number, opts?: { foil?: boolean }) => void
  isBasic: (type?: string | null) => boolean
  parseEnergyTokens: (csv?: string | null) => string[]
  energyTokenIconFile: (token?: string | null) => string | null
  iconFileFor: (token: string) => string | null
  energyCodeMap: Map<string, { file: string | null; alt: string | null }>
  openImage: (card: CardRow) => void
  nonEmpty: (value: any) => boolean
}

export function CardsPage({
  groups,
  openKeys,
  allOpen,
  setOpenKeys,
  diceKey,
  diceGet,
  diceInc,
  massMode,
  setCountModal,
  haveCards,
  haveFoil,
  applyCardDelta,
  isBasic,
  parseEnergyTokens,
  energyTokenIconFile,
  iconFileFor,
  energyCodeMap,
  openImage,
  nonEmpty
}: CardsPageProps) {
  return (
    <div className="cards-grid">
      {!groups.length && <div className="cards-empty">No results. Adjust your filters or search.</div>}

      {groups.map(({ title, key, isBA, items, character, groupLabel }) => {
        const open = openKeys[key] ?? allOpen
        const dKey = diceKey(character, groupLabel)
        const diceVal = diceGet(character, groupLabel)

        return (
          <div key={key} className="card-group">
            <div
              role="button"
              aria-expanded={open}
              onClick={() => setOpenKeys(s => ({ ...s, [key]: !open }))}
              className="card-group-header"
            >
              <div className="card-group-title">
                <span style={{ fontWeight: 600, fontSize: 18 }}>{title}</span>
              </div>

              {!isBA && (
                <span onClick={(e)=>e.stopPropagation()} className="card-group-meta">
                  <span style={{ fontSize: 12, opacity: 0.6 }}>Dice</span>
                  <CountButton
                    value={diceVal}
                    onClick={() => {
                      if (massMode === 'plus') {
                        diceInc(character, groupLabel, 1)
                        return
                      }
                      if (massMode === 'minus') {
                        diceInc(character, groupLabel, -1)
                        return
                      }
                      setCountModal({
                        kind: 'dice',
                        title: character,
                        subtitle: groupLabel ? `Dice - ${groupLabel}` : 'Dice',
                        character,
                        groupLabel,
                        original: diceVal,
                        value: diceVal
                      })
                    }}
                  />
                </span>
              )}
            </div>

            {open && (
              <ul className="card-group-list">
                {items.map((it) => {
                  const isBArow = isBasic(it.type_name || '')
                  const displayName = isBArow ? (it.character_name || '') : (it.card_name || '')
                  const affTokens = (it.aff_tokens ? it.aff_tokens.split(',').map(s=>s.trim()).filter(nonEmpty) : []) as string[]
                  const visibleAffTokens = affTokens.filter(tok => tok !== NO_AFFILIATION_TOKEN)
                  const alignTokens = (it.align_tokens ? it.align_tokens.split(',').map(s=>s.trim()).filter(nonEmpty) : []) as string[]

                  const stdCount = haveCards(it.card_pk)
                  const foilCount = it.has_foil ? haveFoil(it.card_pk) : 0

                  const energyTokens = parseEnergyTokens(it.energy_tokens)
                  const energyMeta = it.energy_code ? energyCodeMap.get(String(it.energy_code)) : undefined
                  const energyIconFile = energyMeta && nonEmpty(energyMeta.file) ? String(energyMeta.file) : null
                  const energyIconAlt = energyMeta?.alt ?? (energyTokens.length ? energyTokens.join('/') : it.energy_code ?? null)
                  const energyIconNode = !isBArow ? (
                    energyIconFile ? (
                      <TokenIconImg
                        token={it.energy_code ?? (energyTokens[0] ?? 'energy')}
                        label={energyIconAlt ?? undefined}
                        file={energyIconFile}
                      />
                    ) : energyTokens.length ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {energyTokens.map(tok => (
                          <TokenIconImg key={tok} token={tok} file={energyTokenIconFile(tok) ?? iconFileFor(tok)} />
                        ))}
                      </span>
                    ) : null
                  ) : null
                  const hasFoil = !!it.has_foil
                  const costChip = typeof it.cost === 'number'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center' }}>{it.cost}</span>
                    : null

                  return (
                    <li
                      key={it.card_pk}
                      onClick={() => openImage(it)}
                      className="card-group-item"
                    >
                      <div className="card-item-left">
                        <span className="rarity-dot" style={rarityDotStyle(it.rarity_rank)} aria-hidden />
                        <div className="card-item-meta">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            {costChip}
                            {energyIconNode}
                            {(visibleAffTokens.length > 0) && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {visibleAffTokens.map(tok => <AffIconImg key={tok} token={tok} />)}
                              </span>
                            )}
                            {alignTokens.length > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                {alignTokens.map(tok => <TokenIconImg key={tok} token={tok} file={iconFileFor(tok)} />)}
                              </span>
                            )}
                          </div>
                          <span className="card-item-text">{displayName || '—'}</span>
                        </div>
                      </div>

                      <div className="card-item-right" onClick={(e)=>e.stopPropagation()}>
                        {hasFoil && (
                          <span className="card-item-counter">
                            <CountButton
                              value={foilCount}
                              className="count-button--foil"
                              onClick={() => {
                                if (massMode === 'plus') {
                                  applyCardDelta(it.card_pk, character, groupLabel, 1, { foil: true })
                                  return
                                }
                                if (massMode === 'minus') {
                                  applyCardDelta(it.card_pk, character, groupLabel, -1, { foil: true })
                                  return
                                }
                                setCountModal({
                                  kind: 'foil',
                                  title: displayName || character,
                                  subtitle: groupLabel ? `${character} · ${groupLabel}` : character,
                                  card_pk: it.card_pk,
                                  original: foilCount,
                                  value: foilCount,
                                  character,
                                  groupLabel
                                })
                              }}
                            />
                          </span>
                        )}

                        <span className="card-item-counter">
                          <CountButton
                            value={stdCount}
                            onClick={() => {
                              if (massMode === 'plus') {
                                applyCardDelta(it.card_pk, character, groupLabel, 1)
                                return
                              }
                              if (massMode === 'minus') {
                                applyCardDelta(it.card_pk, character, groupLabel, -1)
                                return
                              }
                              setCountModal({
                                kind: 'standard',
                                title: displayName || character,
                                subtitle: groupLabel ? `${character} · ${groupLabel}` : character,
                                card_pk: it.card_pk,
                                original: stdCount,
                                value: stdCount,
                                character,
                                groupLabel
                              })
                            }}
                          />
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

const rarityDotStyle = (rank: number | null | undefined): React.CSSProperties => {
  const base: React.CSSProperties = {
    display: 'inline-block',
    width: 7,
    borderRadius: 999,
    alignSelf: 'stretch',
    minHeight: 34,
    marginRight: 4
  }
  switch (rank ?? -1) {
    case 0:
    case 1: return { ...base, background: '#9CA3AF' }
    case 2: return { ...base, background: '#008000' }
    case 3: return { ...base, background: '#ffef00' }
    case 4: return { ...base, background: '#ff0000' }
    case 5: return { ...base, background: '#3B82F6' }
    default: return { ...base, background: '#6B7280' }
  }
}
