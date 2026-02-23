import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    /** Optional: custom fallback message. Defaults to a generic "Something went wrong" card. */
    message?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * ErrorBoundary — catches any unhandled render error in its subtree
 * and displays a graceful fallback instead of a blank white screen.
 *
 * Usage: wrap route-level components in <ErrorBoundary> in App.tsx.
 */
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            const isIndexError = this.state.error?.message?.includes('index');

            return (
                <div className="flex items-center justify-center min-h-[400px] p-8">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center max-w-md w-full">
                        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle size={22} className="text-red-500" />
                        </div>
                        <h2 className="text-base font-bold text-slate-900">
                            {this.props.message ?? 'אירעה שגיאה בטעינת המידע'}
                        </h2>
                        <p className="text-sm text-slate-400 mt-2 mb-6">
                            {isIndexError
                                ? 'יש להגדיר אינדקס ב-Firestore להשלמת השאילתה. בדוק את הקונסול לקישור ישיר.'
                                : 'נסה לרענן את הדף. אם הבעיה חוזרת, בדוק את הקונסול לפרטים.'}
                        </p>
                        <button
                            onClick={this.handleReset}
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                        >
                            <RefreshCw size={15} />
                            נסה שנית
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
