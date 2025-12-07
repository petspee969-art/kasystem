import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Ops! Algo deu errado.</h1>
            <p className="text-gray-600 mb-6">
              Ocorreu um erro inesperado na aplicação. Isso geralmente acontece devido a problemas de conexão ou dados antigos no navegador.
            </p>
            <div className="bg-gray-100 p-4 rounded text-left text-xs text-gray-500 mb-6 overflow-auto max-h-32">
                {this.state.error?.message}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Limpar Dados e Reiniciar
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;