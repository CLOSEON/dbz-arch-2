'use client';

import { useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import type { Order, OrderStatus } from '@/types';

export default function MigrateOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUiStore((s) => s.addToast);
  
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log(msg);
    setLogs((prev) => [...prev, msg]);
  };

  const runMigration = async () => {
    if (user?.role !== 'admin') {
      addToast('Unauthorized', 'error');
      return;
    }

    setLoading(true);
    setLogs([]);
    log('Starting migration script...');

    try {
      // 1. Fetch old delivery_orders
      log('Fetching old delivery_orders...');
      const oldOrdersSnap = await getDocs(collection(db, 'delivery_orders'));
      log(`Found ${oldOrdersSnap.size} legacy delivery_orders.`);

      // 2. Map and migrate
      let migratedCount = 0;
      for (const d of oldOrdersSnap.docs) {
        const data = d.data();
        
        // Generate canonical ID
        const dateStr = data.date || new Date().toISOString().split('T')[0];
        const newOrderId = `ORD-${dateStr}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;

        // Construct canonical Order
        const newOrder: Order = {
          id: newOrderId,
          legacy_order_id: d.id,
          user_id: data.user_id || '',
          vendor_id: data.vendor_id || undefined,
          date: dateStr,
          meal_type: data.meal_type || 'lunch',
          delivery_slot: data.time_slot || '8am',
          delivery_address: data.delivery_address || '',
          status: 'created', // default mapping
          created_at: data.created_at || Timestamp.now(),
          updated_at: Timestamp.now()
        };

        // Write to canonical 'orders' collection
        await setDoc(doc(db, 'orders', newOrder.id), newOrder);
        
        // Write initial OrderStatusLog
        await setDoc(doc(db, 'order_status_logs', `${newOrder.id}_init`), {
          id: `${newOrder.id}_init`,
          order_id: newOrder.id,
          to_status: 'created',
          actor: 'system_migration',
          timestamp: newOrder.created_at
        });
        
        // Archive to deprecated
        await setDoc(doc(db, 'delivery_orders_deprecated', d.id), data);
        
        migratedCount++;
      }

      log(`Migrated ${migratedCount} delivery_orders to canonical orders collection.`);

      // 3. Archive deliveries
      log('Fetching old deliveries...');
      const deliveriesSnap = await getDocs(collection(db, 'deliveries'));
      let delMigrated = 0;
      for (const d of deliveriesSnap.docs) {
        await setDoc(doc(db, 'deliveries_deprecated', d.id), d.data());
        delMigrated++;
      }
      log(`Archived ${delMigrated} deliveries to deliveries_deprecated.`);

      // 4. Archive rider_trips
      log('Fetching old rider_trips...');
      const tripsSnap = await getDocs(collection(db, 'rider_trips'));
      let tripMigrated = 0;
      for (const d of tripsSnap.docs) {
        await setDoc(doc(db, 'rider_trips_deprecated', d.id), d.data());
        tripMigrated++;
      }
      log(`Archived ${tripMigrated} rider_trips to rider_trips_deprecated.`);

      addToast('Migration completed successfully!', 'success');
      log('Migration completed successfully!');
    } catch (error: any) {
      console.error(error);
      log(`Error during migration: ${error.message}`);
      addToast('Migration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return <div className="p-10 text-center">Unauthorized</div>;
  }

  return (
    <div className="page-shell-admin">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Database Migration</h1>
          <p className="text-slate-500 mt-2">Migrate legacy delivery cycles to canonical Orders.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm text-slate-600 mb-6">
            This script will read all documents from <code>delivery_orders</code>, <code>deliveries</code>, and <code>rider_trips</code>,
            convert them into the new canonical <code>Order</code> format, and archive the old collections to <code>_deprecated</code> suffixes.
            <br/><br/>
            <strong>Note:</strong> Data is not deleted, only copied.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={runMigration}
              disabled={loading}
              className="flex-1 bg-brand text-white py-3 rounded-xl font-bold hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Running Migration...' : 'Execute Legacy Migration'}
            </button>

            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const { seedTestAccounts } = await import('@/lib/queries/users');
                  await seedTestAccounts();
                  addToast('Seeded 4 core test accounts! (+919000000001-4)', 'success');
                  log('Successfully seeded 4 test accounts (+919000000001 Admin, +919000000002 Vendor, +919000000003 Rider, +919000000004 Customer)');
                } catch (err: any) {
                  addToast(err.message || 'Seed failed', 'error');
                  log(`Seed error: ${err.message}`);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-600/20"
            >
              Seed 4 Core Test Accounts ⚡
            </button>
          </div>
        </div>

        {logs.length > 0 && (
          <div className="bg-slate-950 rounded-2xl p-6 text-sm font-mono text-green-400 overflow-y-auto max-h-96">
            {logs.map((l, i) => (
              <div key={i} className="mb-1">{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
