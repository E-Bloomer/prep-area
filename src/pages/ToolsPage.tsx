import React from 'react'

type ToolsLink<T> = { label: string; page: T }

type ToolsPageProps<T extends string> = {
  links: ToolsLink<T>[]
  onNavigate: (page: T) => void
  totalOfflineImages: number
  imageCacheStatus: 'idle' | 'downloading' | 'complete' | 'error' | 'unsupported'
  imageCacheProgress: number
  imageCacheMessage: string | null
  onDownloadImages: () => void
}

export function ToolsPage<T extends string>({
  links,
  onNavigate,
  totalOfflineImages,
  imageCacheStatus,
  imageCacheProgress,
  imageCacheMessage,
  onDownloadImages
}: ToolsPageProps<T>) {
  return (
    <div className="tools-grid">
      <div className="tools-link-group">
        <div className="tools-links tools-links--stack">
          {links.map(({ label, page }) => (
            <button
              key={String(page)}
              type="button"
              className="tools-link-button"
              onClick={() => onNavigate(page)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="tools-support-card">
        <h3>Support the Project</h3>
        <p>
          If the app has helped you and you&apos;d like to chip in, you can send a tip via PayPal.
          Sharing the app, filing issues, and offering feedback is equally appreciated.
        </p>
        <a
          href="https://paypal.me/EdmundBloomer"
          target="_blank"
          rel="noreferrer"
          className="support-button"
        >
          Donate via PayPal
        </a>
        <a
          href="https://github.com/E-Bloomer/prep-area"
          target="blank"
          rel="noreferer"
          className='support-button'
        >
          Github repo
        </a>
      </div>
    </div>
  )
}
