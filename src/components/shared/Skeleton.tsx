interface SkeletonCardProps {
  lines?: number;
  hasImage?: boolean;
}

export function SkeletonCard({ lines = 2, hasImage = false }: SkeletonCardProps) {
  return (
    <div className="card animate-pulse">
      {hasImage && <div className="skeleton h-40 w-full mb-3 rounded-xl" />}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton h-4 rounded"
            style={{ width: i === 0 ? '70%' : i === lines - 1 ? '45%' : '90%' }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, hasImage = false }: { count?: number; hasImage?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} hasImage={hasImage} />
      ))}
    </div>
  );
}
