import type { WerewolfScriptId } from '../../../../../shared/games/werewolf'
import type { ScriptDefinition } from '../types'
import { classicScript } from './classic'
import { wolfGuardScript } from './wolfGuard'

export const SCRIPT_DEFINITIONS: Record<WerewolfScriptId, ScriptDefinition> = {
  classic: classicScript,
  'wolf-guard': wolfGuardScript,
}

export function getScript(scriptId: WerewolfScriptId): ScriptDefinition {
  return SCRIPT_DEFINITIONS[scriptId]
}