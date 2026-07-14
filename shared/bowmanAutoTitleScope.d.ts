export interface BowmanAutoTitleScope {
  eligible: boolean
  status: 'eligible' | 'out-of-scope'
  reason: string | null
}

export function classifyBowmanAutoTitleScope(title: string): BowmanAutoTitleScope
