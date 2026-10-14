import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card.js';
import { Eyebrow } from '../components/ui/Eyebrow.js';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled React Error in RaktSetu Web Application:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#0a0a0a] text-[#dadbdf] flex items-center justify-center p-6">
          <Card className="max-w-lg w-full text-center">
            <CardHeader>
              <Eyebrow variant="sunset" className="mb-2">
                UNCAUGHT CLIENT EXCEPTION // SIMULATION SAFEGUARD
              </Eyebrow>
              <CardTitle>System Error Intercepted</CardTitle>
              <CardDescription>
                An unexpected interface error occurred. Biological and spatial matching rules remain safe in the API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {this.state.error && (
                <pre className="p-3 bg-[#1a1c20] border border-[#212327] rounded-[8px] text-xs font-mono text-[#ffc285] text-left overflow-x-auto mb-6">
                  {this.state.error.message}
                </pre>
              )}
              <Button variant="primary" onClick={this.handleReset}>
                Reload Application
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
