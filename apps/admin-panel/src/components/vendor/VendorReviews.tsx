'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Review } from '@/types';
import { formatDate } from '@/lib/utils';
import { Star } from 'lucide-react';

export function VendorReviews({ vendorId }: { vendorId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendorId) loadReviews();
  }, [vendorId]);

  async function loadReviews() {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'reviews'),
        where('vendor_id', '==', vendorId),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      setReviews(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : 'New';

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 card" />
      <div className="h-24 card" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-slate-900">Customer Reviews</h3>
        <div className="flex items-center gap-1 bg-amber-50 text-amber-500 px-2 py-1 rounded-lg border border-amber-100">
          <Star className="w-3 h-3 fill-current" />
          <span className="text-xs font-bold">{averageRating}</span>
          <span className="text-[10px] text-amber-400 font-medium">({reviews.length})</span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
            <Star className="w-6 h-6 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-900">No reviews yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Reviews will appear here once customers start ordering.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-bold text-slate-900">{r.user_name}</span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {formatDate(r.created_at)}
                </span>
              </div>
              <div className="flex gap-0.5 mb-2.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                  />
                ))}
              </div>
              {r.review_text && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {r.review_text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
