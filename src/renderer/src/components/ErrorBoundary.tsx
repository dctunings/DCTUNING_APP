import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo)
    // TODO: Send to Sentry when integrated
    // Sentry.captureException(error, { extra: errorInfo })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
            <h1 className="text-2xl font-bold mb-4 text-red-500">Something went wrong</h1>
            <p className="text-gray-400 mb-4">
              An unexpected error occurred in DCTuning.
            </p>
            {this.state.error && (
              <pre className="bg-gray-800 p-4 rounded text-sm text-red-300 max-w-lg overflow-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              className="mt-6 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        )
      )
    }

    return this.props.children
    return this.props.children
  }
}

export default ErrorBoundary
