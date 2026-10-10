import type { ExplodingKittensCardType } from '../../../shared/games/exploding-kittens'
import { gameAssetUrl } from '../gameAssets'

export function explodingKittensAssetUrl(filename: string): string {
  return gameAssetUrl(`games/exploding-kittens/${filename}`)
}

export function explodingKittensCardFaceUrl(type: ExplodingKittensCardType): string {
  return explodingKittensAssetUrl(`${type}.svg`)
}

const EFFECT_ILLUSTRATIONS: Partial<Record<ExplodingKittensCardType, string>> = {
  'see-the-future': 'see-the-future-illustration.png',
}

export function explodingKittensEffectIllustrationUrl(
  type: ExplodingKittensCardType,
): string | null {
  const filename = EFFECT_ILLUSTRATIONS[type]
  return filename ? explodingKittensAssetUrl(filename) : null
}

export function explodingKittensCardBackUrl(): string {
  return explodingKittensAssetUrl('back.svg')
}
