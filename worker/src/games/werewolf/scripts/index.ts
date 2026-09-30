import type { WerewolfScriptId } from '../../../../../shared/games/werewolf'
import type { ScriptDefinition } from '../types'
import { classicScript } from './classic'

export const SCRIPT_DEFINITIONS: Record<WerewolfScriptId, ScriptDefinition> = {
  classic: classicScript,
}

export function getScript(scriptId: WerewolfScriptId): ScriptDefinition {
  return SCRIPT_DEFINITIONS[scriptId]
}
