import { Component } from 'react';

// Catches render errors below it so one broken component shows a message
// instead of blanking the whole app. `resetKey` clears the error when it
// changes (the page-level boundary passes the route path, so navigating to
// another page recovers). `fullPage` styles the app-level fallback.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fullPage } = this.props;
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          minHeight: fullPage ? '100vh' : 320,
          background: fullPage ? 'var(--bg)' : undefined,
        }}
      >
        <div className="card" style={{ width: 'min(440px, 100%)', textAlign: 'center', padding: '28px 24px' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 28, color: 'var(--orange, #E67E22)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 6px' }}>
            {fullPage ? 'AI Connect ran into a problem' : 'This page ran into a problem'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 16 }}>
            Your data is safe. Try again, or reload the page if it keeps happening.
          </div>
          {import.meta.env.DEV && (
            <pre style={{ textAlign: 'left', fontSize: 11, whiteSpace: 'pre-wrap', color: 'var(--t3)', margin: '0 0 16px', maxHeight: 140, overflow: 'auto' }}>
              {String(error?.message || error)}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {!fullPage && (
              <button type="button" className="btn bs bsm" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            )}
            <button type="button" className="btn bp bsm" onClick={() => window.location.reload()}>
              <i className="fa-solid fa-rotate-right" /> Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
