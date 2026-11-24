import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let display = error?.message || 'Unexpected application error';
    try {
      const parsed = JSON.parse(display);
      if (parsed && parsed.error) {
        display = parsed.error;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: display };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080810] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[#101020] border border-white/10 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-display text-lg font-bold">Something went wrong</h2>
            <p className="text-xs text-[#A2A3B8] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-4 py-2.5 rounded-xl zx-gradient-bg text-white text-xs font-semibold inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reload ZX
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
