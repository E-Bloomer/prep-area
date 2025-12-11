import React, { useCallback, useMemo, useState } from 'react'

const MAX_LIFE = 20
const MIN_LIFE = 0

type Player = 'opponent' | 'me'

type LifeButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
}

const LifeButton = ({ label, onClick, disabled }: LifeButtonProps) => (
  <button
    type="button"
    className="life-counter__button"
    onClick={onClick}
    disabled={disabled}
  >
    {label}
  </button>
)

export function LifeCounterPage() {
  const [life, setLife] = useState<{ opponent: number; me: number }>({
    opponent: MAX_LIFE,
    me: MAX_LIFE
  })

  const adjustLife = useCallback(
    (player: Player, delta: number) => {
      setLife((prev) => {
        const current = prev[player]
        const next = Math.min(MAX_LIFE, Math.max(MIN_LIFE, current + delta))
        if (next === current) return prev
        return { ...prev, [player]: next }
      })
    },
    []
  )

  const reset = useCallback(() => {
    setLife({ opponent: MAX_LIFE, me: MAX_LIFE })
  }, [])

  const limits = useMemo(
    () => ({
      opponent: {
        canInc: life.opponent < MAX_LIFE,
        canDec: life.opponent > MIN_LIFE
      },
      me: {
        canInc: life.me < MAX_LIFE,
        canDec: life.me > MIN_LIFE
      }
    }),
    [life]
  )

  return (
    <div className="life-counter">
      <section className="life-counter__section" aria-label="Opponent life total">
        <h2 className="life-counter__label">Opponent</h2>
        <div className="life-counter__row">
          <div className="life-counter__button-stack">
            <LifeButton
              label="-1"
              onClick={() => adjustLife('opponent', -1)}
              disabled={!limits.opponent.canDec}
            />
            <LifeButton
              label="-5"
              onClick={() => adjustLife('opponent', -5)}
              disabled={!limits.opponent.canDec}
            />
          </div>

          <div className="life-counter__value" aria-live="polite">
            {life.opponent}
          </div>

          <div className="life-counter__button-stack">
            <LifeButton
              label="+1"
              onClick={() => adjustLife('opponent', +1)}
              disabled={!limits.opponent.canInc}
            />
            <LifeButton
              label="+2"
              onClick={() => adjustLife('opponent', +2)}
              disabled={!limits.opponent.canInc}
            />
          </div>
        </div>
      </section>

      <button
        type="button"
        className="life-counter__reset"
        onClick={reset}
        disabled={life.opponent === MAX_LIFE && life.me === MAX_LIFE}
      >
        Reset
      </button>

      <section className="life-counter__section" aria-label="My life total">
        <h2 className="life-counter__label">Me</h2>
        <div className="life-counter__row">
          <div className="life-counter__button-stack">
            <LifeButton
              label="-1"
              onClick={() => adjustLife('me', -1)}
              disabled={!limits.me.canDec}
            />
            <LifeButton
              label="-5"
              onClick={() => adjustLife('me', -5)}
              disabled={!limits.me.canDec}
            />
          </div>

          <div className="life-counter__value" aria-live="polite">
            {life.me}
          </div>

          <div className="life-counter__button-stack">
            <LifeButton
              label="+1"
              onClick={() => adjustLife('me', +1)}
              disabled={!limits.me.canInc}
            />
            <LifeButton
              label="+2"
              onClick={() => adjustLife('me', +2)}
              disabled={!limits.me.canInc}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
