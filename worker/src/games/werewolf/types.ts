import type {
  WerewolfCamp,
  WerewolfPhase,
  WerewolfRoleId,
  WerewolfScriptId,
  WerewolfSeerResult,
  WerewolfSettings,
  WerewolfHunterShot,
  WerewolfPrivateState,
  WerewolfReplayEvent,
} from '../../../../shared/games/werewolf'

export type DeathCause = 'wolf' | 'poison' | 'vote' | 'shot' | 'left'

export interface NightState {
  wolfPicks: Record<string, string | null>
  wolfVictimId: string | null
  seerTargetId: string | null
  guardTargetId: string | null
  witchSave: boolean
  witchPoisonId: string | null
}

export interface StoredWerewolf {
  gameId: 'werewolf'
  settings: WerewolfSettings
  scriptId: WerewolfScriptId
  playerIds: string[]
  playerNames: Record<string, string>
  roles: Record<string, WerewolfRoleId>
  alive: Record<string, boolean>
  phase: WerewolfPhase
  day: number
  nightStep: number
  phaseEndsAt: number
  stateVersion: number
  night: NightState
  witchPotions: { antidote: boolean; poison: boolean }
  seerResults: WerewolfSeerResult[]
  votes: Record<string, string | null>
  voteSelections: Record<string, string | null>
  pkCandidateIds: string[]
  lastDeathIds: string[]
  exiledId: string | null
  pendingShooterId: string | null
  afterHunter: 'day-discussion' | 'night'
  lastGuardTargetId: string | null
  speechOrder: string[]
  speakerIndex: number
  hunterShot: WerewolfHunterShot | null
  winner: WerewolfCamp | null
  replay: WerewolfReplayEvent[]
}

export type NightActionResult = { ok: true } | { ok: false; message: string }

export interface RoleNightAction {
  action: string
  handle(game: StoredWerewolf, playerId: string, payload: Record<string, unknown>): NightActionResult
  onStepEnd?(game: StoredWerewolf): void
}

export interface RoleDefinition {
  id: WerewolfRoleId
  camp: WerewolfCamp
  nightAction?: RoleNightAction
  triggersShotOnDeath?(cause: DeathCause): boolean
  privateState?(
    game: StoredWerewolf,
    playerId: string,
    acting: boolean,
  ): Partial<WerewolfPrivateState>
}

export interface ScriptDefinition {
  id: WerewolfScriptId
  roleSetup(playerCount: number): WerewolfRoleId[]
  nightSteps: WerewolfRoleId[][]
  resolveNight(game: StoredWerewolf): Array<{ playerId: string; cause: DeathCause }>
  checkWin(game: StoredWerewolf): WerewolfCamp | null
}
