import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

/**
 * Error boundary that catches render errors in lazy-loaded routes.
 * On chunk load failures, offers a one-click reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: Error): State {
    const isChunkError =
      error.message.includes("Failed to fetch dynamically imported module") ||
      error.message.includes("Loading chunk") ||
      error.message.includes("Loading CSS chunk");
    return { hasError: true, isChunkError };
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, isChunkError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-lg font-semibold text-foreground">
          {this.state.isChunkError ? "Update available" : "Something went wrong"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {this.state.isChunkError
            ? "A newer version is available. Reload to get the latest."
            : "An unexpected error occurred while loading this view."}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={this.handleReload}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Reload
          </button>
          {!this.state.isChunkError && (
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
}
