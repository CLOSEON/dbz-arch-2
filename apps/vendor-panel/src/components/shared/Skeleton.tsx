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

export function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse p-4">
      <div className="flex justify-between items-center">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-8 w-32 rounded-2xl" />
      </div>
      <div className="card flex flex-col md:flex-row gap-6 items-center">
        <div className="skeleton w-24 h-24 rounded-3xl" />
        <div className="flex-1 space-y-3 w-full">
          <div className="skeleton h-6 w-1/3 rounded" />
          <div className="skeleton h-4 w-1/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-20" />
        ))}
      </div>
    </div>
  );
}
