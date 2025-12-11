import React, { useMemo, useState } from 'react'

export type ProxyDiceEntry = {
  card_pk: number
  character: string
  setCode: string | null
  diceKey: string
  diceDisplay: string
  searchText: string
}

type ProxyDicePageProps = {
  cards: ProxyDiceEntry[]
  isSmallScreen: boolean
}

type ProxyDiceGroup = {
  diceKey: string
  diceDisplay: string
  primary: ProxyDiceEntry
  proxies: ProxyDiceEntry[]
}

export function ProxyDicePage({
  cards,
  isSmallScreen
}: ProxyDicePageProps) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const normalizedDice = trimmed.replace(/\s+/g, '')
  const isDiceQuery = normalizedDice.length > 0 && /^[0-9]+$/.test(normalizedDice)
  const lower = trimmed.toLowerCase()

  const cardsByDice = useMemo(() => {
    const map = new Map<string, ProxyDiceEntry[]>()
    for (const card of cards) {
      if (!map.has(card.diceKey)) map.set(card.diceKey, [])
      map.get(card.diceKey)!.push(card)
    }
    map.forEach(list => {
      list.sort((a, b) => {
        const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
        if (charCmp !== 0) return charCmp
        const setCmp = (a.setCode || '').localeCompare(b.setCode || '', undefined, { sensitivity: 'base' })
        if (setCmp !== 0) return setCmp
        return a.card_pk - b.card_pk
      })
    })
    return map
  }, [cards])

  const diceMatches = useMemo(() => {
    if (!isDiceQuery) return [] as ProxyDiceEntry[]
    return cardsByDice.get(normalizedDice) ?? []
  }, [isDiceQuery, normalizedDice, cardsByDice])

  const textGroups = useMemo(() => {
    if (!trimmed || isDiceQuery) return [] as ProxyDiceGroup[]
    const groups: ProxyDiceGroup[] = []
    const seenDice = new Set<string>()
    for (const card of cards) {
      if (!card.searchText.includes(lower)) continue
      if (seenDice.has(card.diceKey)) continue
      const groupCards = cardsByDice.get(card.diceKey) ?? [card]
      const primary = groupCards.find(entry => entry.card_pk === card.card_pk) ?? groupCards[0]
      const proxies = groupCards
        .filter(entry => entry.card_pk !== primary.card_pk)
      groups.push({
        diceKey: card.diceKey,
        diceDisplay: primary.diceDisplay,
        primary,
        proxies
      })
      seenDice.add(card.diceKey)
      if (groups.length >= 120) break
    }
    return groups
  }, [cards, cardsByDice, isDiceQuery, lower, trimmed])

  const renderSetTag = (card: ProxyDiceEntry) => {
    const code = card.setCode ? card.setCode.toUpperCase() : null
    if (!code) return null
    return <span className="proxy-dice-set">({code})</span>
  }

  const renderPrimaryCard = (card: ProxyDiceEntry) => (
    <div className="proxy-dice-primary">
      <span className="proxy-dice-name">{card.character || 'Unknown'}</span>
      <span className="proxy-dice-sub">
        {renderSetTag(card)}
      </span>
    </div>
  )

  const renderSecondaryCard = (card: ProxyDiceEntry) => (
    <div className="proxy-dice-secondary">
      <span className="proxy-dice-name">{card.character || 'Unknown'}</span>
      <span className="proxy-dice-sub">
        {renderSetTag(card)}
      </span>
    </div>
  )

  return (
    <div
      className="proxy-dice"
      style={{ paddingBottom: isSmallScreen ? '120px' : '160px' }}
    >
      <div className="proxy-dice-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by character or die code…"
          className="proxy-dice-input"
        />
        {!trimmed && (
          <div className="proxy-dice-help">
            Find proxy dice by character name (e.g. <strong>Batman</strong>) or by die stats
            (e.g. <strong>021 022 133</strong> or <strong>021022133</strong>).
          </div>
        )}
      </div>

      {isDiceQuery ? (
        <div className="proxy-dice-results">
          {diceMatches.length === 0 && (
            <div className="proxy-dice-empty">No dice matched that stat line.</div>
          )}
          {diceMatches.map(card => (
            <div key={card.card_pk} className="proxy-dice-row">
              {renderSecondaryCard(card)}
              <span className="proxy-dice-code">{card.diceDisplay}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="proxy-dice-results">
          {trimmed && textGroups.length === 0 && (
            <div className="proxy-dice-empty">No cards matched that search.</div>
          )}
          {!trimmed && (
            <div className="proxy-dice-empty">Start typing to find matching dice.</div>
          )}
          {textGroups.map(group => (
            <div key={group.diceKey} className="proxy-dice-group">
              <div className="proxy-dice-header">
                {renderPrimaryCard(group.primary)}
                <span className="proxy-dice-code">{group.diceDisplay}</span>
              </div>
              {group.proxies.length ? (
                <ul className="proxy-dice-proxies">
                  {group.proxies.map(proxy => (
                    <li key={proxy.card_pk} className="proxy-dice-proxy">
                      {renderSecondaryCard(proxy)}
                      <span className="proxy-dice-code">{proxy.diceDisplay}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="proxy-dice-empty proxy-dice-empty--sub">
                  No direct proxies share this die.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
