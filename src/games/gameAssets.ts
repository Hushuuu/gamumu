export function gameAssetUrl(assetPath: string): string {
  return `${import.meta.env.BASE_URL}${assetPath}`
}
