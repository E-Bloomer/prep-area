import React from 'react'

type PlaceholderPageProps = {
  title: string
  message?: string
}

export function PlaceholderPage({ title, message = 'Placeholder page. We can wire this up next (router, layouts, etc.).' }: PlaceholderPageProps) {
  return (
    <div style={{ opacity: 0.75, fontSize: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div>{message}</div>
    </div>
  )
}
