import * as Sentry from '@sentry/electron/renderer'

export function initSentry(): void {
  // TODO: Set SENTRY_DSN in environment variables
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    console.warn('Sentry DSN not configured — error tracking disabled')
    return
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `dctuning-desktop@${import.meta.env.VITE_APP_VERSION || 'dev'}`,
    beforeSend(event) {
      // Scrub ECU file paths and binary data from error reports
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.stacktrace?.frames) {
            for (const frame of ex.stacktrace.frames) {
              if (frame.vars) {
                delete frame.vars.buffer
                delete frame.vars.data
                // Scrub file paths
                if (frame.vars.path) {
                  frame.vars.path = '[REDACTED]'
                }
              }
            }
          }
        }
      }
      return event
    },
  })
}
