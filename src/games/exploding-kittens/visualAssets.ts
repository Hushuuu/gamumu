import type { ExplodingKittensCardType } from '../../../shared/games/exploding-kittens'
import { gameAssetUrl } from '../gameAssets'

export function explodingKittensAssetUrl(filename: string): string {
  return gameAssetUrl(`games/exploding-kittens/${filename}`)
}

export function explodingKittensCardFaceUrl(type: ExplodingKittensCardType): string {
  return explodingKittensAssetUrl(`${type}.svg`)
}

export function explodingKittensCardBackUrl(): string {
  return explodingKittensAssetUrl('back.svg')
}
