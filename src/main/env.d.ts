export {}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly VIJIA_DEBUG?: string
      readonly VIJIA_DISABLE_COOLDOWNS?: string
      /** `1` / `true` / `yes`: proactive user message always demands `should_speak: true`. */
      readonly VIJIA_PROACTIVE_FORCE_SPEAK?: string
    }
  }
}
