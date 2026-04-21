export type ProactiveSuggestionType =
  | 'guide_offer'
  | 'personal_context'
  | 'return_nudge'
  | 'important_flag'
  | 'task_switch'

export type ProactiveClaudeButton = {
  id: string
  label: string
}

export type ProactiveClaudeShouldSpeak = {
  should_speak: true
  message: string
  type: ProactiveSuggestionType
  buttons?: ProactiveClaudeButton[]
}

export type ProactiveClaudeResponse = { should_speak: false } | ProactiveClaudeShouldSpeak
