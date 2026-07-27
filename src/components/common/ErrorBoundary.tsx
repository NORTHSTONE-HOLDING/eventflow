import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  title?: string
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('EventFlow ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl">⚠️</div>
          <h1 className="mt-4 font-display text-2xl text-white">
            {this.props.title ?? 'Došlo k neočekávané chybě'}
          </h1>
          <p className="mt-2 max-w-md text-sm text-slate-400">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="btn btn-gold mt-5"
          >
            Zkusit znovu
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
