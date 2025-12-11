import React from 'react'
import { CardRow } from '../types/models'
import { AffIconImg, TokenIconImg } from './IconImages'
import { NO_AFFILIATION_TOKEN } from '../constants/assets'

type Group = {
  title: string
  key: string
  isBA: boolean
  items: CardRow[]
}

type TeamAddResultsProps = {
  groups: Group[]
  openState: Record<string, boolean>
  allOpen: boolean
  onToggleGroup: (key: string) => void
  onAddCard: (card: CardRow) => void
  isCardAdded: (cardPk: number) => boolean
  isBasic: (type?: string | null) => boolean
  parseEnergyTokens: (csv?: string | null) => string[]
  energyTokenIconFile: (token?: string | null) => string | null
  iconFileFor: (token: string) => string | null
  nonEmpty: (value: any) => boolean
  onOpenCard?: (card: CardRow) => void
}

export function TeamAddResults({
  groups,
  openState,
  allOpen,
  onToggleGroup,
  onAddCard,
  isCardAdded,
  isBasic,
  parseEnergyTokens,
  energyTokenIconFile,
  iconFileFor,
  nonEmpty,
  onOpenCard
}: TeamAddResultsProps) {
  return (
    <div className="team-add-results">
      {groups.length === 0 ? (
        <div className="team-add-results-empty">No cards match the current filters.</div>
      ) : (
        groups.map(group => (
          <div key={group.key} className="team-add-group">
            <button
              type="button"
              className="team-add-group-header"
              onClick={() => onToggleGroup(group.key)}
            >
              <span>{group.title}</span>
              <span aria-hidden>{(openState[group.key] ?? allOpen) ? '▾' : '▸'}</span>
            </button>
            {(openState[group.key] ?? allOpen) && (
              <ul className="team-add-group-list">
                {group.items.map((card) => {
                  const isBArow = isBasic(card.type_name || '')
                  const displayName = isBArow ? (card.character_name || '') : (card.card_name || '')
                  const affTokens = (card.aff_tokens ? card.aff_tokens.split(',').map(s => s.trim()).filter(nonEmpty) : []) as string[]
                  const visibleAffTokens = affTokens.filter(tok => tok !== NO_AFFILIATION_TOKEN)
                  const alignTokens = (card.align_tokens ? card.align_tokens.split(',').map(s => s.trim()).filter(nonEmpty) : []) as string[]
                  const energyTokens = parseEnergyTokens(card.energy_tokens)
                  const energyMeta = card.energy_code ? energyTokenIconFile(card.energy_code) : null
                  const added = isCardAdded(card.card_pk)

                  return (
                    <li key={card.card_pk} className="team-add-card">
                      <button
                      type="button"
                      className="team-add-card-main"
                      onClick={() => onOpenCard?.(card)}
                    >
                      <div className="team-add-card-meta">
                        {typeof card.cost === 'number' && <span className="team-card-cost">{card.cost}</span>}
                        {energyTokens.length > 0 && (
                          <span className="team-card-energy">
                            {energyTokens.map(token => (
                              <TokenIconImg key={token} token={token} file={energyMeta ?? energyTokenIconFile(token)} />
                            ))}
                          </span>
                        )}
                        {visibleAffTokens.length > 0 && (
                          <span className="team-card-affiliations">
                            {visibleAffTokens.map(tok => <AffIconImg key={tok} token={tok} />)}
                          </span>
                        )}
                        {alignTokens.length > 0 && (
                          <span className="team-card-alignments">
                            {alignTokens.map(tok => <TokenIconImg key={tok} token={tok} file={iconFileFor(tok)} />)}
                          </span>
                        )}
                      </div>
                      <div className="team-add-card-title">{displayName || '—'}</div>
                    </button>
                    <button
                      type="button"
                      className="team-add-card-button"
                      onClick={() => onAddCard(card)}
                      disabled={added}
                    >
                      {added ? 'Added' : '+'}
                    </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  )
}
