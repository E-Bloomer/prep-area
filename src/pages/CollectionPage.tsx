import React from 'react'
import { CollectionStats, ImportReport } from '../types/models'

type CollectionPageProps = {
  ready: boolean
  onBackupDb: () => void
  onImportBackupClick: () => void
  backupImporting: boolean
  backupImportError: string | null
  backupFileInputRef: React.RefObject<HTMLInputElement>
  onImportBackupFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  onExportCollection: () => void
  onImportClick: () => void
  importing: boolean
  importError: string | null
  importReport: ImportReport | null
  fileInputRef: React.RefObject<HTMLInputElement>
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  statsOpen: boolean
  statsLoading: boolean
  statsError: string | null
  statsData: CollectionStats | null
  onToggleStats: (next: boolean) => void
}

export function CollectionPage({
  ready,
  onBackupDb,
  onImportBackupClick,
  backupImporting,
  backupImportError,
  backupFileInputRef,
  onImportBackupFile,
  onExportCollection,
  onImportClick,
  importing,
  importError,
  importReport,
  fileInputRef,
  onImportFile,
  statsOpen,
  statsLoading,
  statsError,
  statsData,
  onToggleStats
}: CollectionPageProps) {
  const statsToggleDisabled = !ready || statsLoading

  return (
    <div className="collection-section collection-section--collection">
      <div style={{ fontWeight: 600 }}>Collection Tools</div>
      <div className="collection-tool-group">
        <div className="collection-tools collection-tools--primary-group">
          <button
            type="button"
            className="collection-button"
            onClick={onBackupDb}
            disabled={!ready}
          >
            Backup DB
          </button>
          <button
            type="button"
            className="collection-button"
            onClick={() => {
              if (!ready || backupImporting) return
              if (window.confirm('Importing a backup will overwrite your current collection data. Continue?')) {
                onImportBackupClick()
              }
            }}
            disabled={!ready || backupImporting}
          >
            {backupImporting ? 'Importing…' : 'Import DB Backup'}
          </button>
          <button
            type="button"
            className="collection-button"
            onClick={onExportCollection}
            disabled={!ready}
          >
            Export Collection
          </button>
          <button
            type="button"
            className="collection-button"
            onClick={() => {
              if (!ready || importing) return
              if (window.confirm('Importing from Transition Zone will overwrite your current collection. Continue?')) {
                onImportClick()
              }
            }}
            disabled={!ready || importing}
          >
            {importing ? 'Importing…' : 'Import from Transition Zone'}
          </button>
        </div>
      </div>
      <div className="collection-tools collection-tools--stats">
        <button
          type="button"
          className={`collection-button collection-button--primary ${statsOpen ? 'collection-button collection-button--primary--active' : ''}`}
          onClick={() => onToggleStats(!statsOpen)}
          disabled={statsToggleDisabled}
        >
          {statsLoading ? 'Loading…' : 'Show collection stats'}
        </button>
      </div>
      <input
        type="file"
        accept=".sqlite,application/octet-stream,application/x-sqlite3"
        ref={backupFileInputRef}
        style={{ display: 'none' }}
        onChange={onImportBackupFile}
      />
      <input
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel,application/csv"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={onImportFile}
      />
      {backupImportError && (
        <div className="import-error">{backupImportError}</div>
      )}
      {importError && (
        <div className="import-error">{importError}</div>
      )}
      {importReport && (
        <div className="import-report">
          <div className="import-report-summary">
            <span>
              <strong>Cards added</strong>: {importReport.totalStandard + importReport.totalFoil}
              {' '}
              (standard: {importReport.totalStandard}, foil: {importReport.totalFoil})
            </span>
            <span>
              <strong>Dice added</strong>: {importReport.diceTotal}
            </span>
          </div>
          {importReport.unmatched.length ? (
            <div className="import-report-list">
              <div><strong>Unmatched cards:</strong></div>
              <ul>
                {importReport.unmatched.map((row, index) => {
                  const key = `${row.set || ''}||${row.character || ''}||${row.card || ''}||${index}`
                  return (
                    <li key={key}>
                      {`${row.set || '—'} / ${row.character || '—'} / ${row.card || '—'}`}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div>All cards added successfully</div>
          )}
        </div>
      )}
      {statsOpen && (
        <div className="collection-stats">
          {statsError && (
            <div className="import-error">{statsError}</div>
          )}
          {statsLoading && !statsError && !statsData && (
            <div className="collection-stat-loading">Loading stats…</div>
          )}
          {!statsError && statsData && (
            <>
              <div className="collection-stats-summary">
                <div>
                  <span className="collection-stat-label">Total cards</span>
                  <span className="collection-stat-value">
                    {statsData.totalStandard + statsData.totalFoil}
                    <span className="collection-stat-subvalue">
                      Standard: {statsData.totalStandard} · Foil: {statsData.totalFoil}
                    </span>
                  </span>
                </div>
                <div>
                  <span className="collection-stat-label">Total dice</span>
                  <span className="collection-stat-value">{statsData.totalDice}</span>
                </div>
                <div>
                  <span className="collection-stat-label">Unique cards</span>
                  <span className="collection-stat-value">
                    {statsData.uniqueOwned}/{statsData.uniqueTotal}
                    <span className="collection-stat-subvalue">
                      {statsData.uniqueTotal ? ((statsData.uniqueOwned / statsData.uniqueTotal) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </span>
                </div>
                <div>
                  <span className="collection-stat-label">Unique foils</span>
                  <span className="collection-stat-value">
                    {statsData.uniqueFoilOwned}/{statsData.foilEligibleTotal}
                    <span className="collection-stat-subvalue">
                      {statsData.foilEligibleTotal ? ((statsData.uniqueFoilOwned / statsData.foilEligibleTotal) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </span>
                </div>
              </div>
              <div className="collection-stats-universes">
                <div className="collection-stat-label">Cards by universe</div>
                <ul>
                  {statsData.universes.map((u) => (
                    <li key={u.name}>
                      <div className="universe-header">
                        <span className="universe-name">{u.name}</span>
                        <span className="universe-values">
                          <span className="universe-metric">
                            {u.owned}/{u.total}
                            <span className="collection-stat-subvalue">
                              {u.total ? u.percent.toFixed(1) : '0.0'}%
                            </span>
                          </span>
                          <span className="universe-metric">
                            {u.foilOwned}/{u.foilTotal}
                            <span className="collection-stat-subvalue">
                              {u.foilTotal ? u.foilPercent.toFixed(1) : '0.0'}%
                            </span>
                          </span>
                        </span>
                      </div>
                      {u.sets.length > 0 && (
                        <ul className="universe-set-list">
                          {u.sets.map((set) => (
                            <li key={set.name}>
                              <span className="universe-set-name">{set.name}</span>
                              <span className="universe-values">
                                <span className="universe-metric">
                                  {set.owned}/{set.total}
                                  <span className="collection-stat-subvalue">
                                    {set.total ? set.percent.toFixed(1) : '0.0'}%
                                  </span>
                                </span>
                                <span className="universe-metric">
                                  {set.foilOwned}/{set.foilTotal}
                                  <span className="collection-stat-subvalue">
                                    {set.foilTotal ? set.foilPercent.toFixed(1) : '0.0'}%
                                  </span>
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
