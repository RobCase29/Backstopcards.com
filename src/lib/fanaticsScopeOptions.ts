import type { ChecklistModel } from '../types'

export type FanaticsScopeOptions = {
  player: string[]
  team: string[]
  set: string[]
}

function uniqueSorted(values: Array<string | null | undefined>) {
  const canonical = new Map<string, string>()
  for (const rawValue of values) {
    const value = rawValue?.trim()
    if (!value) continue
    const key = value.toLocaleLowerCase()
    if (!canonical.has(key)) canonical.set(key, value)
  }
  return [...canonical.values()].sort((left, right) => left.localeCompare(right))
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function releaseLabel(model: ChecklistModel) {
  const product = model.release.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const title = product.replace(/\b\w/g, (letter) => letter.toUpperCase())
  return title.startsWith(String(model.releaseYear)) ? title : `${model.releaseYear} ${title}`
}

export function buildFanaticsScopeOptions(
  models: ChecklistModel[],
  teamForPlayer: (playerName: string, checklistTeam?: string | null) => string = (_playerName, checklistTeam) => checklistTeam ?? '',
): FanaticsScopeOptions {
  return {
    player: uniqueSorted(models.flatMap((model) => model.players.map((player) => player.playerName))),
    team: uniqueSorted(models.flatMap((model) => model.players.map((player) => teamForPlayer(player.playerName, player.team)))),
    set: uniqueSorted(models.map(releaseLabel)),
  }
}

export function fanaticsScopedPlayerNames(
  models: ChecklistModel[],
  scopeType: 'player' | 'team',
  scopeValue: string,
  teamForPlayer: (playerName: string, checklistTeam?: string | null) => string = (_playerName, checklistTeam) => checklistTeam ?? '',
) {
  const scopeKey = normalized(scopeValue)
  if (!scopeKey) return []
  return uniqueSorted(models.flatMap((model) => model.players.flatMap((player) => {
    const candidate = normalized(
      scopeType === 'team' ? teamForPlayer(player.playerName, player.team) : player.playerName,
    )
    if (!candidate) return []
    const matches = scopeType === 'team'
      ? candidate === scopeKey
      : candidate === scopeKey || candidate.includes(scopeKey) || scopeKey.includes(candidate)
    return matches ? [player.playerName] : []
  })))
}
