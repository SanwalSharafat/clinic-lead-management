import { CheckCircle, AlertTriangle, AlertCircle, MoreHorizontal, Loader2 } from 'lucide-react';
import { useHumanReviews } from '../hooks/useHumanReviews';
import type { HumanReview, ScoreTier, ReviewReason } from '../types';

interface ReviewQueueProps {
  onSelect: (review: HumanReview) => void;
}

const tierConfig: Record<ScoreTier, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  HIGH: { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-bg', border: 'border-l-danger' },
  MEDIUM: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning-bg', border: 'border-l-warning' },
  LOW: { icon: CheckCircle, color: 'text-accent', bg: 'bg-accent-muted', border: 'border-l-accent' },
};

const reasonLabel: Record<ReviewReason, string> = {
  HIGH_SCORE: 'High score — needs approval',
  MEDIUM_SCORE: 'Medium score — review recommended',
  LOW_AI_CONFIDENCE: 'Low AI confidence',
  AMBIGUOUS_RESPONSE: 'Ambiguous response',
  PATIENT_REQUESTED_HUMAN: 'Patient requested human',
  DATA_CONFLICT: 'Data conflict detected',
};

function ReviewRow({ review, onSelect }: { review: HumanReview; onSelect: (r: HumanReview) => void }) {
  const tier = tierConfig[review.score_tier] ?? tierConfig.LOW;
  const TierIcon = tier.icon;

  return (
    <div
      onClick={() => onSelect(review)}
      className={`
        group flex items-center px-4 py-3 border-b border-border cursor-pointer
        hover:bg-bg-page transition-colors border-l-4 ${tier.border}
      `}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{review.patient_name}</span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${tier.bg} ${tier.color}`}>
            <TierIcon className="w-3 h-3" />
            {review.score_tier} — {review.score}
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5 truncate">
          {review.reason_for_visit || reasonLabel[review.reason]}
        </p>
      </div>

      <div className="flex items-center gap-1.5 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onSelect(review); }}
          className="px-2.5 py-1 text-[11px] font-medium rounded-btn bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Approve
        </button>
        <button
          onClick={e => { e.stopPropagation(); onSelect(review); }}
          className="px-2.5 py-1 text-[11px] font-medium rounded-btn border border-border text-text-secondary hover:bg-bg-page transition-colors"
        >
          Correct
        </button>
        <button
          onClick={e => { e.stopPropagation(); onSelect(review); }}
          className="px-2.5 py-1 text-[11px] font-medium rounded-btn border border-border text-text-secondary hover:bg-bg-page transition-colors"
        >
          Escalate
        </button>
        <button
          onClick={e => { e.stopPropagation(); onSelect(review); }}
          className="p-1.5 rounded-btn text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ReviewQueue({ onSelect }: ReviewQueueProps) {
  const { data, isLoading, isError, refetch } = useHumanReviews({ resolved: false, limit: 50 });

  if (isLoading) {
    return (
      <div className="mx-6 mt-5 bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Review queue</h3>
          <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="w-24 h-3 bg-bg-page rounded animate-pulse" />
              <div className="w-16 h-3 bg-bg-page rounded animate-pulse" />
              <div className="flex-1 h-3 bg-bg-page rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-5 bg-surface border border-border rounded-card p-6 text-center">
        <AlertCircle className="w-5 h-5 text-danger mx-auto mb-2" />
        <p className="text-sm text-text-secondary">Failed to load review queue</p>
        <button
          onClick={() => refetch()}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded-btn bg-accent text-white hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  const reviews = data?.reviews || [];

  return (
    <div className="mx-6 mt-5 mb-6 bg-surface border border-border rounded-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-primary">Review queue</h3>
          {reviews.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-accent-muted text-accent">
              {reviews.length}
            </span>
          )}
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <CheckCircle className="w-6 h-6 text-accent mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Nothing waiting on you right now</p>
          <p className="text-xs text-text-muted mt-1">All reviews have been handled</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {reviews.map(review => (
            <ReviewRow key={review.id} review={review} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
