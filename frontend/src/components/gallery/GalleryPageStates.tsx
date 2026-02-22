import { Link } from 'react-router-dom';
import { Layout } from '../Layout';
import { Loader2 } from 'lucide-react';

interface GalleryLoadErrorStateProps {
  error: string;
  onRetry: () => void;
}

export const GalleryInitialLoadingState = () => (
  <Layout>
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-16 h-16 animate-spin text-accent" />
        <p className="text-lg text-muted">Loading gallery...</p>
      </div>
    </div>
  </Layout>
);

export const GalleryLoadErrorState = ({ error, onRetry }: GalleryLoadErrorStateProps) => (
  <Layout>
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="text-danger text-lg font-medium">Failed to load gallery</div>
        <div className="text-muted dark:text-muted-dark">{error}</div>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-accent/20"
        >
          Try Again
        </button>
      </div>
    </div>
  </Layout>
);

export const GalleryNotFoundState = () => (
  <Layout>
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <div className="text-muted dark:text-muted-dark text-lg">Gallery not found</div>
        <Link to="/" className="text-accent hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  </Layout>
);
