import type {
  AvalonCamp,
  AvalonEndReason,
  AvalonMissionCard,
  AvalonMissionResult,
  AvalonPhase,
  AvalonRoleId,
  AvalonSettings,
  AvalonVoteResult,
} from '../../../../shared/games/avalon'

export interface StoredAvalon {
  gameId: 'avalon'
  settings: AvalonSettings
  playerIds: string[]
  roles: Record<string, AvalonRoleId>
  phase: AvalonPhase
  stateVersion: number
  initialLeaderId: string
  leaderId: string
  missionNumber: number
  teamIds: string[]
  readyIds: string[]
  rejectedTeams: number
  voteSelections: Record<string, boolean>
  lastVote: AvalonVoteResult | null
  voteHistory: AvalonVoteResult[]
  missionSelections: Record<string, AvalonMissionCard>
  missions: AvalonMissionResult[]
  lakeHolderId: string | null
  lakeVisitedIds: string[]
  lakeResults: Array<{
    holderId: string
    missionNumber: number
    targetId: string
    camp: AvalonCamp
  }>
  lakeAfterPhase: 'team-selection' | 'assassination' | null
  winner: AvalonCamp | null
  endReason: AvalonEndReason | null
  departedPlayerId: string | null
  assassinationTargetId: string | null
  assassinationHit: boolean | null
}
