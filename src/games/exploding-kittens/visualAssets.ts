import type { ExplodingKittensCardType } from '../../../shared/games/exploding-kittens'
import { gameAssetUrl } from '../gameAssets'

export function explodingKittensAssetUrl(filename: string): string {
  return gameAssetUrl(`games/exploding-kittens/${filename}`)
}

const CARD_ILLUSTRATIONS: Partial<Record<ExplodingKittensCardType, string>> = {
  'exploding-kitten': 'exploding-kitten-illustration.webp',
  defuse: 'defuse-illustration.webp',
  nope: 'nope-illustration.webp',
  attack: 'attack-illustration.webp',
  skip: 'skip-illustration.webp',
  favor: 'favor-illustration.webp',
  shuffle: 'shuffle-illustration.webp',
  'see-the-future': 'see-the-future-illustration.webp',
  'cat-pudding': 'cat-pudding-illustration.webp',
  'cat-taro': 'cat-taro-illustration.webp',
  'cat-matcha': 'cat-matcha-illustration.webp',
  'cat-peach': 'cat-peach-illustration.webp',
  'cat-mochi': 'cat-mochi-illustration.webp',
}

export function explodingKittensCardFaceUrl(type: ExplodingKittensCardType): string {
  const filename = CARD_ILLUSTRATIONS[type]
  return filename
    ? explodingKittensAssetUrl(filename)
    : explodingKittensAssetUrl(`${type}.svg`)
}

export function explodingKittensEffectIllustrationUrl(
  type: ExplodingKittensCardType,
): string | null {
  const filename = CARD_ILLUSTRATIONS[type]
  return filename ? explodingKittensAssetUrl(filename) : null
}

export function explodingKittensCardBackUrl(): string {
  return explodingKittensAssetUrl('back.svg')
}
