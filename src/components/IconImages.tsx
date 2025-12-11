import React from 'react'
import { ICONS_ROOT, NO_AFFILIATION_LABEL, NO_AFFILIATION_TOKEN } from '../constants/assets'

export const AffIconImg = ({ token, label }: { token: string; label?: string }) => {
  const tokenForIcon = token === NO_AFFILIATION_TOKEN ? '0' : token
  const srcPrimary = `${ICONS_ROOT}/a${tokenForIcon}.png`
  const srcFallback = `${ICONS_ROOT}/${token}.png`
  const onErr: React.ReactEventHandler<HTMLImageElement> = (event) => {
    const img = event.currentTarget as HTMLImageElement & { __triedFallback?: boolean }
    if (img.__triedFallback) {
      img.style.display = 'none'
    } else {
      img.__triedFallback = true
      img.src = srcFallback
    }
  }
  const title = label || (token === NO_AFFILIATION_TOKEN ? NO_AFFILIATION_LABEL : token)
  const size = tokenForIcon === '46' ? 40 : 20
  return <img src={srcPrimary} onError={onErr} alt={title} title={title} style={{ width: size, height: 20, objectFit: 'contain' }} />
}

export type TokenIconImgProps = { token: string; label?: string; file?: string | null }

export const TokenIconImg = ({ token, label, file }: TokenIconImgProps) => {
  const title = label || token
  const src = file
    ? (file.startsWith('/') || file.startsWith('http')
        ? file
        : `${ICONS_ROOT}/${file}`)
    : `${ICONS_ROOT}/${token}.png`
  return (
    <img
      src={src}
      alt={title}
      title={title}
      style={{ width: 20, height: 20, objectFit: 'contain' }}
      onError={(e)=>((e.currentTarget as HTMLImageElement).style.display='none')}
    />
  )
}
