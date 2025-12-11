export type CardRow = {
  card_pk: number
  set_id: number
  set_label: string | null
  set_group: string | null
  universe: string | null
  card_number: string | number | null
  character_name: string
  card_name: string | null
  cost: number | null
  energy_code: string | null
  energy_tokens: string | null
  type_name: string | null
  rarity?: string | null
  rarity_rank: number | null
  gender?: string | null
  aff_tokens?: string | null
  align_tokens?: string | null
  has_errata?: number | null
  has_foil?: number | null
}

export type Team = {
  team_id: number
  name: string
  created_at: string | null
  updated_at: string | null
}

export type TeamCard = {
  team_id: number
  card_pk: number
  dice_count: number
}

export type AffIcon = { token: string; file: string; alt: string | null; is_composite: number; components: string | null }
export type AlignOpt = { token: string; name: string }
export type FormatOpt = { id: number; code: string | null; name: string; notes: string | null }

export type ImportRowIdentifier = { set: string | null; character: string | null; card: string | null }

export type ImportReport = {
  totalStandard: number
  totalFoil: number
  diceTotal: number
  unmatched: ImportRowIdentifier[]
}

export type CollectionStats = {
  totalStandard: number
  totalFoil: number
  totalDice: number
  uniqueOwned: number
  uniqueTotal: number
  uniqueFoilOwned: number
  foilEligibleTotal: number
  universes: Array<{
    name: string
    owned: number
    total: number
    percent: number
    foilOwned: number
    foilTotal: number
    foilPercent: number
    sets: Array<{
      name: string
      owned: number
      total: number
      percent: number
      foilOwned: number
      foilTotal: number
      foilPercent: number
    }>
  }>
}

export type CountModalState =
  | {
      kind: 'dice'
      title: string
      subtitle?: string
      character: string
      groupLabel: string
      original: number
      value: number
    }
  | {
      kind: 'standard'
      title: string
      subtitle?: string
      card_pk: number
      original: number
      value: number
      character: string
      groupLabel: string
    }
  | {
      kind: 'foil'
      title: string
      subtitle?: string
      card_pk: number
      original: number
      value: number
      character: string
      groupLabel: string
    }
  | {
      kind: 'team-dice'
      title: string
      subtitle?: string
      teamId: number
      card_pk: number
      original: number
      value: number
      maxDice: number
      ownedDice: number
      teamRemaining: number
      limit: number
    }

export type TradePartnerTotals = {
  spareStandard: number
  spareFoil: number
  spareDice: number
  needStandard: number
  needFoil: number
  needAny: number
  needDice: number
  rows: number
}

export type TradeListEntryFlags = {
  spare: boolean
  missing: boolean
  tradePlus: boolean
  tradeMinus: boolean
  dice: boolean
}

export type TradeListEntry = {
  id: string
  kind: 'card' | 'dice'
  cardPk?: number
  character: string
  cardName: string
  set: string
  cardCost: number | null
  cardType: string | null
  cost: number | null
  spareStandard: number
  spareFoil: number
  needStandard: number
  needFoil: number
  needAny: number
  partnerSpareStandard: number
  partnerSpareFoil: number
  partnerNeedStandard: number
  partnerNeedFoil: number
  partnerNeedAny: number
  tradePlusStandard: number
  tradePlusFoil: number
  tradePlusDice: number
  tradeMinusStandard: number
  tradeMinusFoil: number
  tradeMinusDice: number
  diceOwned: number
  diceRequired: number
  diceSpare: number
  diceNeed: number
  partnerDiceSpare: number
  partnerDiceNeed: number
  preferFoil: boolean
  foilUpgradeForUs: boolean
  foilUpgradeForPartner: boolean
  flags: TradeListEntryFlags
}

export type TradeSummary = {
  total: number
  spares: number
  missing: number
  tradePlus: number
  tradeMinus: number
}

export type TradeCompareResult = {
  entries: TradeListEntry[]
  summary: TradeSummary
  unmatched: ImportRowIdentifier[]
  partnerTotals: TradePartnerTotals
}
