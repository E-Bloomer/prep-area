import React, { useMemo } from 'react'
import { Team, CardRow } from '../types/models'
import { AffIconImg, TokenIconImg } from '../components/IconImages'
import { CountButton } from '../components/Buttons'
import { NO_AFFILIATION_TOKEN } from '../constants/assets'
import { THEME_TEXT_MUTED } from '../constants/theme'

export type TeamCardInfo = {
  row: CardRow
  diceCount: number
  maxDice: number
  ownedDice: number
}

type TeamDetailPageProps = {
  team: Team
  diceTotal: number
  diceLimit: number
  cards: TeamCardInfo[]
  onBack: () => void
  onAddCards: () => void
  onEditDice: (info: TeamCardInfo) => void
  onRemoveCard: (cardPk: number) => void
  isBasic: (type?: string | null) => boolean
  parseEnergyTokens: (csv?: string | null) => string[]
  energyTokenIconFile: (token?: string | null) => string | null
  iconFileFor: (token: string) => string | null
  nonEmpty: (value: any) => boolean
  onOpenCard?: (card: CardRow) => void
}

export function TeamDetailPage({
  team,
  diceTotal,
  diceLimit,
  cards,
  onBack,
  onAddCards,
  onEditDice,
  onRemoveCard,
  isBasic,
  parseEnergyTokens,
  energyTokenIconFile,
  iconFileFor,
  nonEmpty,
  onOpenCard
}: TeamDetailPageProps) {
  const groups = useMemo(() => {
    type Group = {
      title: string
      key: string
      isBA: boolean
      items: TeamCardInfo[]
      character: string
      groupLabel: string
    }

    const byKey = new Map<string, Group>()
    const labelFor = (row: CardRow) => row.set_group ?? row.set_label ?? ''

    for (const entry of cards) {
      const { row } = entry
      const groupLabel = labelFor(row)
      const isBArow = isBasic(row.type_name || '')
      const key = `${isBArow ? 'BAC' : 'CHAR'}||${groupLabel}||${isBArow ? 'BAC' : row.character_name}`
      if (!byKey.has(key)) {
        const title = isBArow ? `Basic Action (${groupLabel})` : `${row.character_name} (${groupLabel})`
        byKey.set(key, {
          title,
          key,
          isBA: isBArow,
          items: [],
          character: row.character_name || '',
          groupLabel
        })
      }
      byKey.get(key)!.items.push(entry)
    }

    for (const group of byKey.values()) {
      group.items.sort((a, b) => {
        const rowA = a.row
        const rowB = b.row
        const rankA = rowA.rarity_rank ?? 9999
        const rankB = rowB.rarity_rank ?? 9999
        if (rankA !== rankB) return rankA - rankB
        const numA = String(rowA.card_number ?? '')
        const numB = String(rowB.card_number ?? '')
        return numA.localeCompare(numB, undefined, { numeric: true })
      })
    }

    return Array.from(byKey.values()).sort((a, b) => {
      if (a.isBA !== b.isBA) return a.isBA ? -1 : 1
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })
  }, [cards, isBasic])

  return (
    <div className="team-detail-page">
      <div className="team-detail-header">
        <div className="team-detail-title">
          <button type="button" className="team-detail-back" onClick={onBack}>
            ← Teams
          </button>
          <h1>{team.name}</h1>
          <div className="team-detail-meta">
            {diceTotal}/{diceLimit} dice · {cards.length} cards
          </div>
        </div>
        <button type="button" className="teams-add-button" onClick={onAddCards}>
          + Add cards
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="team-detail-empty">No cards in this team yet. Use “Add cards” to populate the roster.</div>
      ) : (
        <div className="team-cards">
          {groups.map((group) => (
            <div key={group.key} className="team-card-group">
              <div className="team-card-group-header">{group.title}</div>
              <ul className="team-card-group-list">
                {group.items.map((info) => {
                  const row = info.row
                  const isBArow = isBasic(row.type_name || '')
                  const displayName = isBArow ? (row.character_name || '') : (row.card_name || '')
                  const affTokens = (row.aff_tokens ? row.aff_tokens.split(',').map(s => s.trim()).filter(nonEmpty) : []) as string[]
                  const visibleAffTokens = affTokens.filter(tok => tok !== NO_AFFILIATION_TOKEN)
                  const alignTokens = (row.align_tokens ? row.align_tokens.split(',').map(s => s.trim()).filter(nonEmpty) : []) as string[]
                  const energyTokens = parseEnergyTokens(row.energy_tokens)
                  const energyMeta = row.energy_code ? energyTokenIconFile(row.energy_code) : null
                  const ownedText = info.ownedDice > 0 ? `${info.ownedDice} owned` : 'No dice owned'
                  const maxText = `Max ${info.maxDice}`

                  return (
                    <li key={row.card_pk} className="team-card-item">
                      <div
                        className="team-card-main"
                        onClick={() => {
                          if (onOpenCard) onOpenCard(row)
                        }}
                      >
                        <div className="team-card-meta">
                          {typeof row.cost === 'number' && <span className="team-card-cost">{row.cost}</span>}
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
                        <div className="team-card-title">{displayName || '—'}</div>
                      </div>
                      <div className="team-card-actions">
                        <CountButton value={info.diceCount} onClick={() => onEditDice(info)} />
                        <button
                          type="button"
                          className="team-card-remove"
                          onClick={() => onRemoveCard(row.card_pk)}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
