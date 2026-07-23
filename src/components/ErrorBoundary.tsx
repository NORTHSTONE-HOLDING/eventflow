import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Neočekávaná chyba',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EventFlow ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="panel"
          style={{
            margin: '2rem auto',
            maxWidth: 520,
            textAlign: 'center',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <h2 className="gold-text" style={{ fontSize: '1.5rem', marginBottom: 8 }}>
            {this.props.fallbackTitle ?? 'Něco se pokazilo'}
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.9rem' }}>
            {this.state.message}
          </p>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              window.location.assign('/')
            }}
          >
            Obnovit EventFlow
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
