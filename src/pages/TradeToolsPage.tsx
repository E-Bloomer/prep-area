import React from 'react'
import { TradeCompareResult, TradeListEntry } from '../types/models'

type TradeToolsPageProps = {
  ready: boolean
  tradeKeepBoth: boolean
  onTradeKeepBothChange: (value: boolean) => void
  onExportTrades: () => void
  onImportTradesClick: () => void
  tradeImporting: boolean
  tradeImportError: string | null
  tradeResult: TradeCompareResult | null
  tradeFileInputRef: React.RefObject<HTMLInputElement>
  onImportTradesFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  onOpenCardImage: (cardPk: number) => void
}

type TradeFilterKey = 'trades' | 'spare' | 'tradePlus' | 'tradeMinus'

export function TradeToolsPage({
  ready,
  tradeKeepBoth,
  onTradeKeepBothChange,
  onExportTrades,
  onImportTradesClick,
  tradeImporting,
  tradeImportError,
  tradeResult,
  tradeFileInputRef,
  onImportTradesFile,
  onOpenCardImage
}: TradeToolsPageProps) {
  const tradeToggleDisabled = !ready
  const [tradeFilter, setTradeFilter] = React.useState<TradeFilterKey>('spare')

  const [tradeSort, setTradeSort] = React.useState<'name' | 'set' | 'cost'>('name')

  const tradeEntries = React.useMemo(() => {
    if (!tradeResult) return []

    const matchesFilter = (entry: TradeListEntry) => {
      if (tradeFilter === 'trades') return entry.flags.tradePlus || entry.flags.tradeMinus
      if (tradeFilter === 'spare') return entry.flags.spare
      if (tradeFilter === 'tradePlus') return entry.flags.tradePlus
      if (tradeFilter === 'tradeMinus') return entry.flags.tradeMinus
      return true
    }

    let filtered = tradeResult.entries.filter(matchesFilter)
    const advancedSort = tradeFilter === 'tradePlus' || tradeFilter === 'tradeMinus' || tradeFilter === 'trades'

    if (filtered.length > 1) {
      const hasCardComponent = (entry: TradeListEntry) => {
        if (tradeFilter === 'tradePlus') return entry.tradePlusStandard > 0 || entry.tradePlusFoil > 0
        if (tradeFilter === 'tradeMinus') return entry.tradeMinusStandard > 0 || entry.tradeMinusFoil > 0
        if (tradeFilter === 'spare') return entry.spareStandard > 0 || entry.spareFoil > 0
        if (tradeFilter === 'trades') {
          return (
            entry.tradePlusStandard > 0 ||
            entry.tradePlusFoil > 0 ||
            entry.tradeMinusStandard > 0 ||
            entry.tradeMinusFoil > 0
          )
        }
        return false
      }

      const hasDiceComponent = (entry: TradeListEntry) => {
        if (tradeFilter === 'tradePlus') return entry.tradePlusDice > 0
        if (tradeFilter === 'tradeMinus') return entry.tradeMinusDice > 0
        if (tradeFilter === 'spare') return entry.diceSpare > 0
        if (tradeFilter === 'trades') {
          return entry.tradePlusDice > 0 || entry.tradeMinusDice > 0
        }
        return entry.tradePlusDice > 0 || entry.tradeMinusDice > 0 || entry.diceSpare > 0 || entry.diceNeed > 0
      }

      const groups = new Map<string, TradeListEntry[]>()
      filtered.forEach((entry) => {
        if (entry.kind !== 'card') return
        const key = `${entry.character}||${entry.set}`
        const existing = groups.get(key)
        if (existing) existing.push(entry)
        else groups.set(key, [entry])
      })

      if (groups.size > 0) {
        const dropIds = new Set<string>()
        groups.forEach((entries) => {
          if (entries.length <= 1) return
          const hasCard = entries.some(hasCardComponent)
          if (hasCard) {
            entries.forEach((entry) => {
              if (hasDiceComponent(entry) && !hasCardComponent(entry)) {
                dropIds.add(entry.id)
              }
            })
          } else {
            let keptDiceOnly = false
            entries.forEach((entry) => {
              if (!hasDiceComponent(entry)) return
              if (!keptDiceOnly) {
                keptDiceOnly = true
                return
              }
              dropIds.add(entry.id)
            })
          }
        })

        if (dropIds.size > 0) {
          filtered = filtered.filter(entry => !dropIds.has(entry.id))
        }
      }
    }

    const compareByName = (a: TradeListEntry, b: TradeListEntry) => {
      const charCmp = a.character.localeCompare(b.character, undefined, { sensitivity: 'base' })
      if (charCmp !== 0) return charCmp
      return (a.cardName || '').localeCompare(b.cardName || '', undefined, { sensitivity: 'base' })
    }

    const compareBySet = (a: TradeListEntry, b: TradeListEntry) => {
      const setCmp = a.set.localeCompare(b.set, undefined, { sensitivity: 'base' })
      if (setCmp !== 0) return setCmp
      return compareByName(a, b)
    }

    const compareByCost = (a: TradeListEntry, b: TradeListEntry) => {
      const costA = a.cost
      const costB = b.cost
      if (costA == null && costB == null) return compareByName(a, b)
      if (costA == null) return 1
      if (costB == null) return -1
      if (costA !== costB) return costA - costB
      return compareByName(a, b)
    }

    const sortMode = advancedSort ? tradeSort : 'name'

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'set') return compareBySet(a, b)
      if (sortMode === 'cost') return compareByCost(a, b)
      return compareByName(a, b)
    })

    return sorted
  }, [tradeResult, tradeFilter, tradeSort, tradeKeepBoth])

  const tradeSummary = tradeResult?.summary ?? null
  const partnerTotals = tradeResult?.partnerTotals ?? null
  const showAdvancedControls = tradeFilter === 'tradePlus' || tradeFilter === 'tradeMinus' || tradeFilter === 'trades'
  return (
    <div className="collection-section">
      <div className="collection-trades">
        <div className="collection-trades-header">
          <div>
            <div className="collection-trades-title">Trade Tools</div>
            <div className="collection-trades-note">Export your spare list or compare with a partner.</div>
          </div>
          <label className={`collection-toggle ${tradeKeepBoth ? 'collection-toggle--on' : ''} ${tradeToggleDisabled ? 'collection-toggle--disabled' : ''}`}>
            <input
              type="checkbox"
              checked={tradeKeepBoth}
              onChange={(event) => onTradeKeepBothChange(event.target.checked)}
              disabled={tradeToggleDisabled}
            />
            <span>Keep standard and foil sets</span>
          </label>
        </div>
        <div className="collection-tools">
          <button
            type="button"
            className="collection-button"
            onClick={onExportTrades}
            disabled={!ready}
          >
            Export trades CSV
          </button>
          <button
            type="button"
            className="collection-button collection-button--warning"
            onClick={onImportTradesClick}
            disabled={!ready || tradeImporting}
          >
            {tradeImporting ? 'Importing…' : 'Import trades CSV'}
          </button>
        </div>
        <input
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel,application/csv"
          ref={tradeFileInputRef}
          style={{ display: 'none' }}
          onChange={onImportTradesFile}
        />
        {tradeImportError && (
          <div className="import-error">{tradeImportError}</div>
        )}
        {tradeResult ? (
          <div className="trade-panel">
            <div className="trade-summary">
              <span>Entries: {tradeEntries.length}/{tradeSummary?.total ?? 0}</span>
              {tradeSummary && (
                <span>
                  Spares: {tradeSummary.spares} · Missing: {tradeSummary.missing} · Trade+: {tradeSummary.tradePlus} · Trade-: {tradeSummary.tradeMinus}
                </span>
              )}
              {partnerTotals && (
                <span>
                  They spare — Std {partnerTotals.spareStandard} · Foil {partnerTotals.spareFoil} · Dice {partnerTotals.spareDice}; They need — Std {partnerTotals.needStandard} · Foil {partnerTotals.needFoil} · Any {partnerTotals.needAny} · Dice {partnerTotals.needDice}
                </span>
              )}
            </div>
            <div className="trade-filters">
              {[
                { key: 'spare' as TradeFilterKey, label: 'Spares' },
                { key: 'tradePlus' as TradeFilterKey, label: 'Trade +' },
                { key: 'tradeMinus' as TradeFilterKey, label: 'Trade -' },
                { key: 'trades' as TradeFilterKey, label: 'Trades' }
              ].map(({ key, label }) => {
                const active = tradeFilter === key
                return (
                  <button
                    key={key}
                    type="button"
                    className={`collection-button ${active ? 'collection-button--active' : ''}`}
                    onClick={() => setTradeFilter(key)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {showAdvancedControls && (
              <div className="trade-refinements">
                <div className="trade-sort">
                  <span>Sort by</span>
                  <select
                    value={tradeSort}
                    onChange={(event) => setTradeSort(event.target.value as 'name' | 'set' | 'cost')}
                  >
                    <option value="name">Name</option>
                    <option value="set">Set</option>
                    <option value="cost">Cost</option>
                  </select>
                </div>
              </div>
            )}
            <div className="trade-key">
              <span className="trade-chip trade-chip--spare">You spare</span>
              <span className="trade-chip trade-chip--missing">You need</span>
              <span className="trade-chip trade-chip--plus">Trade +</span>
              <span className="trade-chip trade-chip--minus">Trade -</span>
              <span className="trade-chip trade-chip--partner">They spare</span>
              <span className="trade-chip trade-chip--need">They need</span>
            </div>
            {tradeEntries.length ? (
              <ul className="trade-list trade-list--single">
                {tradeEntries.map((entry) => {
                  const isSpareView = tradeFilter === 'spare'
                  const isTradePlusView = tradeFilter === 'tradePlus'
                  const isTradeMinusView = tradeFilter === 'tradeMinus'
                  const isTradesView = tradeFilter === 'trades'

                  const isCardEntry = entry.kind === 'card'
                  const cardType = (entry.cardType || '').toLowerCase()
                  const isBasicAction = isCardEntry && cardType.includes('basic action')
                const canOpenCard = isCardEntry && entry.cardPk != null

                const detailSuffixParts: string[] = []
                if (entry.set) detailSuffixParts.push(entry.set)
                if (typeof entry.cost === 'number') detailSuffixParts.push(`Cost ${entry.cost}`)
                const detailSuffix = detailSuffixParts.length ? ` (${detailSuffixParts.join(' · ')})` : ''

                const handleOpenCard = () => {
                  if (!canOpenCard) return
                  onOpenCardImage(entry.cardPk!)
                }
                  const handleOpenCardKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (!canOpenCard) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenCardImage(entry.cardPk!)
                    }
                  }

                  const spareParts: string[] = []
                  if (entry.spareStandard > 0) spareParts.push(`Std ×${entry.spareStandard}`)
                  if (entry.spareFoil > 0) spareParts.push(`Foil ×${entry.spareFoil}`)
                  if (entry.diceSpare > 0 && (!isCardEntry || !isBasicAction)) spareParts.push(`Dice ×${entry.diceSpare}`)

                  const needParts: string[] = []
                  if (tradeKeepBoth) {
                    if (entry.needStandard > 0) needParts.push(`Std ×${entry.needStandard}`)
                    if (entry.needFoil > 0) needParts.push(`Foil ×${entry.needFoil}`)
                    if (entry.needAny > 0) needParts.push(`Any ×${entry.needAny}`)
                  } else if (entry.needAny > 0) {
                    needParts.push(`Any ×${entry.needAny}`)
                  } else {
                    if (entry.needFoil > 0) needParts.push(`Foil ×${entry.needFoil}`)
                    if (entry.needStandard > 0) needParts.push(`Std ×${entry.needStandard}`)
                  }
                  if (entry.diceNeed > 0 && (!isCardEntry || !isBasicAction)) needParts.push(`Dice ×${entry.diceNeed}`)

                  const tradePlusParts: string[] = []
                  if (entry.tradePlusStandard > 0) tradePlusParts.push(`Std ×${entry.tradePlusStandard}`)
                  if (entry.tradePlusFoil > 0) tradePlusParts.push(`Foil ×${entry.tradePlusFoil}`)
                  if (entry.tradePlusDice > 0 && (!isCardEntry || !isBasicAction)) tradePlusParts.push(`Dice ×${entry.tradePlusDice}`)

                  const tradeMinusParts: string[] = []
                  if (entry.tradeMinusStandard > 0) tradeMinusParts.push(`Std ×${entry.tradeMinusStandard}`)
                  if (entry.tradeMinusFoil > 0) tradeMinusParts.push(`Foil ×${entry.tradeMinusFoil}`)
                  if (entry.tradeMinusDice > 0 && (!isCardEntry || !isBasicAction)) tradeMinusParts.push(`Dice ×${entry.tradeMinusDice}`)

                  const partnerSpareParts: string[] = []
                  if (entry.partnerSpareStandard > 0) partnerSpareParts.push(`Std ×${entry.partnerSpareStandard}`)
                  if (entry.partnerSpareFoil > 0) partnerSpareParts.push(`Foil ×${entry.partnerSpareFoil}`)
                  if (entry.partnerDiceSpare > 0 && (!isCardEntry || !isBasicAction)) partnerSpareParts.push(`Dice ×${entry.partnerDiceSpare}`)

                  const partnerNeedParts: string[] = []
                  if (entry.partnerNeedStandard > 0) partnerNeedParts.push(`Std ×${entry.partnerNeedStandard}`)
                  if (entry.partnerNeedFoil > 0) partnerNeedParts.push(`Foil ×${entry.partnerNeedFoil}`)
                  if (entry.partnerNeedAny > 0) partnerNeedParts.push(`Any ×${entry.partnerNeedAny}`)
                  if (entry.partnerDiceNeed > 0 && (!isCardEntry || !isBasicAction)) partnerNeedParts.push(`Dice ×${entry.partnerDiceNeed}`)

                  return (
                    <li key={entry.id} className="trade-item">
                      <div
                        className={`trade-item-main${canOpenCard ? ' trade-item-main--clickable' : ''}`}
                        onClick={handleOpenCard}
                        onKeyDown={handleOpenCardKey}
                        role={canOpenCard ? 'button' : undefined}
                        tabIndex={canOpenCard ? 0 : undefined}
                      >
                        <span className="trade-name">{entry.character}</span>
                        <span className="trade-card"> — {entry.cardName}{detailSuffix}</span>
                      </div>
                      <div className="trade-item-meta">
                        {entry.flags.spare && (isSpareView || isTradeMinusView) && spareParts.length > 0 && !isTradesView && (
                          <span className="trade-chip trade-chip--spare">Spare: {spareParts.join(' · ')}</span>
                        )}
                        {entry.flags.missing && needParts.length > 0 && !isSpareView && !isTradeMinusView && !isTradesView && (
                          <span className="trade-chip trade-chip--missing">Need: {needParts.join(' · ')}</span>
                        )}
                        {entry.flags.tradePlus && !isTradeMinusView && !isSpareView && (
                          <span className="trade-chip trade-chip--plus">Trade +: {tradePlusParts.join(' · ') || '—'}</span>
                        )}
                        {entry.flags.tradeMinus && !isTradePlusView && !isSpareView && (
                          <span className="trade-chip trade-chip--minus">Trade -: {tradeMinusParts.join(' · ') || '—'}</span>
                        )}
                        {partnerSpareParts.length > 0 && !isTradePlusView && !isSpareView && (
                          <span className="trade-chip trade-chip--partner">They spare: {partnerSpareParts.join(' · ')}</span>
                        )}
                        {partnerNeedParts.length > 0 && !isTradePlusView && !isSpareView && (
                          <span className="trade-chip trade-chip--need">They need: {partnerNeedParts.join(' · ')}</span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="trade-empty">No results match the selected filters.</div>
            )}
            {tradeResult.unmatched.length ? (
              <div className="trade-unmatched">
                <div><strong>Unmatched rows</strong></div>
                <ul>
                  {tradeResult.unmatched.map((row, index) => (
                    <li key={`trade-unmatched-${row.set || ''}||${row.character || ''}||${row.card || ''}||${index}`}>
                      {`${row.set || '—'} / ${row.character || '—'} / ${row.card || '—'}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="trade-empty">Import a trades CSV to see matches.</div>
        )}
      </div>
    </div>
  )
}
