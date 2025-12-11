import React, { useEffect, useMemo, useState } from 'react'
import { CardRow, Team } from '../types/models'
import { SearchPage } from './SearchPage'
import { TeamAddResults } from '../components/TeamAddResults'

type Group = {
  title: string
  key: string
  isBA: boolean
  items: CardRow[]
  character: string
  groupLabel: string
}

type TeamAddPageProps = {
  team: Team
  diceTotal: number
  diceLimit: number
  filteredRows: CardRow[]
  isBasic: (type?: string | null) => boolean
  parseEnergyTokens: (csv?: string | null) => string[]
  energyTokenIconFile: (token?: string | null) => string | null
  iconFileFor: (token: string) => string | null
  nonEmpty: (value: any) => boolean
  onBack: () => void
  onAddCard: (card: CardRow) => void
  isCardAdded: (cardPk: number) => boolean
  onOpenCard?: (card: CardRow) => void
  searchProps: Omit<React.ComponentProps<typeof SearchPage>, 'onSearch'>
}

export function TeamAddPage({
  team,
  diceTotal,
  diceLimit,
  filteredRows,
  isBasic,
  parseEnergyTokens,
  energyTokenIconFile,
  iconFileFor,
  nonEmpty,
  onBack,
  onAddCard,
  isCardAdded,
  onOpenCard,
  searchProps
}: TeamAddPageProps) {
  const [panel, setPanel] = useState<'filters' | 'results'>('results')
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})
  const [allOpen, setAllOpen] = useState(true)

  const groups = useMemo(() => {
    const byKey = new Map<string, Group>()
    const labelFor = (row: CardRow) => row.set_group ?? row.set_label ?? ''

    for (const row of filteredRows) {
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
      byKey.get(key)!.items.push(row)
    }

    for (const group of byKey.values()) {
      group.items.sort((a, b) => {
        const rankA = a.rarity_rank ?? 9999
        const rankB = b.rarity_rank ?? 9999
        if (rankA !== rankB) return rankA - rankB
        const numA = String(a.card_number ?? '')
        const numB = String(b.card_number ?? '')
        return numA.localeCompare(numB, undefined, { numeric: true })
      })
    }

    return Array.from(byKey.values()).sort((a, b) => {
      if (a.isBA !== b.isBA) return a.isBA ? -1 : 1
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })
  }, [filteredRows, isBasic])

  const toggleAll = (wantOpen: boolean) => {
    const next: Record<string, boolean> = {}
    groups.forEach(g => { next[g.key] = wantOpen })
    setOpenKeys(next)
    setAllOpen(wantOpen)
  }

  useEffect(() => {
    setOpenKeys({})
    setAllOpen(true)
  }, [filteredRows])

  const onToggleGroup = (key: string) => {
    setOpenKeys(prev => ({ ...prev, [key]: !(prev[key] ?? allOpen) }))
  }

  return (
    <div className="team-add-page">
      <div className="team-add-header">
        <div className="team-add-title">
          <button type="button" className="team-detail-back" onClick={onBack}>
            ← {team.name}
          </button>
          <h1>Add cards</h1>
          <div className="team-detail-meta">
            {diceTotal}/{diceLimit} dice · {groups.reduce((sum, g) => sum + g.items.length, 0)} matches
          </div>
        </div>
        <div className="team-add-panel-toggle">
          <button
            type="button"
            className={['team-add-panel-button', panel === 'filters' ? 'team-add-panel-button--active' : ''].filter(Boolean).join(' ')}
            onClick={() => setPanel('filters')}
          >
            Filters
          </button>
          <button
            type="button"
            className={['team-add-panel-button', panel === 'results' ? 'team-add-panel-button--active' : ''].filter(Boolean).join(' ')}
            onClick={() => setPanel('results')}
          >
            Results
          </button>
        </div>
      </div>

      {panel === 'filters' ? (
        <div className="team-add-filters-panel">
          <SearchPage {...searchProps} onSearch={() => setPanel('results')} />
        </div>
      ) : (
        <div className="team-add-results-panel">
          <div className="team-add-results-toolbar">
            <button
              type="button"
              className="team-add-toolbar-button"
              onClick={() => toggleAll(!allOpen)}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
            <span className="team-add-toolbar-meta">
              Showing {groups.reduce((sum, g) => sum + g.items.length, 0)} cards across {groups.length} groups
            </span>
          </div>
          <TeamAddResults
            groups={groups}
            openState={openKeys}
            allOpen={allOpen}
            onToggleGroup={onToggleGroup}
            onAddCard={onAddCard}
            isCardAdded={isCardAdded}
            isBasic={isBasic}
            parseEnergyTokens={parseEnergyTokens}
            energyTokenIconFile={energyTokenIconFile}
            iconFileFor={iconFileFor}
            nonEmpty={nonEmpty}
            onOpenCard={onOpenCard}
          />
        </div>
      )}
    </div>
  )
}
