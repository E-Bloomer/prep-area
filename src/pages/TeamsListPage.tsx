import React, { useState } from 'react'
import { Team } from '../types/models'

export type TeamSummary = {
  team: Team
  diceTotal: number
  cardCount: number
}

type TeamsListPageProps = {
  teams: TeamSummary[]
  onCreateTeam: () => number | null
  onRenameTeam: (teamId: number, name: string) => void
  onDeleteTeam: (teamId: number) => void
  onOpenTeam: (teamId: number) => void
}

type EditingState = { teamId: number; value: string } | null

export function TeamsListPage({
  teams,
  onCreateTeam,
  onRenameTeam,
  onDeleteTeam,
  onOpenTeam
}: TeamsListPageProps) {
  const [editing, setEditing] = useState<EditingState>(null)

  const handleCreate = () => {
    const id = onCreateTeam()
    if (id) {
      setEditing({ teamId: id, value: '' })
    }
  }

  const handleRenameCommit = (teamId: number) => {
    if (!editing || editing.teamId !== teamId) return
    const value = editing.value.trim()
    onRenameTeam(teamId, value || 'Untitled Team')
    setEditing(null)
  }

  return (
    <div className="teams-list-page">
      <div className="teams-list-header">
        <h1>Teams</h1>
        <button type="button" className="teams-create-button" onClick={handleCreate}>
          + New Team
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="teams-empty">No teams yet. Create one to get started.</div>
      ) : (
        <ul className="teams-list">
          {teams.map(({ team, diceTotal, cardCount }) => {
            const isEditing = editing?.teamId === team.team_id
            return (
              <li key={team.team_id} className="teams-list-item">
                <div className="teams-list-item-main">
                  {isEditing ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleRenameCommit(team.team_id)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
                    >
                      <input
                        autoFocus
                        value={editing.value}
                        onChange={(e) => setEditing({ teamId: team.team_id, value: e.target.value })}
                        onBlur={() => handleRenameCommit(team.team_id)}
                        className="teams-list-edit-input"
                        placeholder="Team name"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="teams-list-select"
                      onClick={() => onOpenTeam(team.team_id)}
                    >
                      <span className="teams-list-name">{team.name}</span>
                      <span className="teams-list-meta">{cardCount} cards · {diceTotal} dice</span>
                    </button>
                  )}
                </div>
                <div className="teams-list-actions">
                  {!isEditing && (
                    <button
                      type="button"
                      className="teams-list-action-button"
                      onClick={() => setEditing({ teamId: team.team_id, value: team.name })}
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    className="teams-list-action-button teams-list-action-button--danger"
                    onClick={() => {
                      if (window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) {
                        onDeleteTeam(team.team_id)
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
