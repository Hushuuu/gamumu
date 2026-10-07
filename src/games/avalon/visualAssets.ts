import type {
  AvalonCamp,
  AvalonMissionOutcome,
  AvalonPhase,
  AvalonRoleId,
} from '../../../shared/games/avalon'
import { gameAssetUrl } from '../gameAssets'

export function avalonAssetUrl(filename: string): string {
  return gameAssetUrl(`games/avalon/${filename}`)
}

export function avalonRoleIconUrl(roleId: AvalonRoleId): string {
  return avalonAssetUrl(`role-${roleId}.svg`)
}

export function avalonPhaseIconUrl(phase: AvalonPhase): string {
  return avalonAssetUrl(`phase-${phase}.svg`)
}

export function avalonCampIconUrl(camp: AvalonCamp): string {
  return avalonAssetUrl(`camp-${camp}.svg`)
}

export function avalonMissionIconUrl(outcome: AvalonMissionOutcome): string {
  return avalonAssetUrl(`mission-${outcome}.svg`)
}
