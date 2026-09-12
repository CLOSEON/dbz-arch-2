'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    
    if (Capacitor.isNativePlatform()) {
      FirebaseCrashlytics.recordException({
        message: error.stack || error.message,
      }).catch(err => console.error('Failed to log to Crashlytics:', err));
    }
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 bg-rose-50 text-rose-600 rounded-2xl m-4 flex flex-col items-center justify-center text-center">
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm opacity-80">A crash report has been sent. Please restart the app.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
