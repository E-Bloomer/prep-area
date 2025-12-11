import React from 'react'

export const NavButton = ({ label, active, onClick, compact = false }: { label: string; active: boolean; onClick: () => void; compact?: boolean }) => {
  const classes = ['nav-button']
  if (compact) classes.push('nav-button--compact')
  if (active) classes.push('nav-button--active')
  return (
    <button onClick={onClick} className={classes.join(' ')}>
      {label}
    </button>
  )
}

export const CountButton = ({
  value,
  onClick,
  style,
  className
}: {
  value: number
  onClick: () => void
  style?: React.CSSProperties
  className?: string
}) => (
  <button
    onClick={onClick}
    className={['count-button', className].filter(Boolean).join(' ')}
    style={style}
  >
    {value}
  </button>
)
