import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { DeliveryStatus } from '@/types/delivery';
import toast from 'react-hot-toast';

const QUEUE_KEY = 'dabzo_delivery_action_queue';

export interface QueuedAction {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  reason?: string;
  timestamp: number;
}

export const pushToQueue = (payload: Omit<QueuedAction, 'id' | 'timestamp'>) => {
  if (typeof window === 'undefined') return;

  const currentQueueStr = localStorage.getItem(QUEUE_KEY);
  const queue: QueuedAction[] = currentQueueStr ? JSON.parse(currentQueueStr) : [];

  const newAction: QueuedAction = {
    ...payload,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
  };

  queue.push(newAction);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  
  console.log('[Offline Queue] Added action to offline queue:', newAction);
};

export const processQueue = async () => {
  if (typeof window === 'undefined') return;

  const currentQueueStr = localStorage.getItem(QUEUE_KEY);
  if (!currentQueueStr) return;

  let queue: QueuedAction[] = JSON.parse(currentQueueStr);
  if (queue.length === 0) return;

  console.log(`[Offline Queue] Processing ${queue.length} items...`);

  // We process sequentially to avoid overwhelming the network and preserve order
  const updateFn = httpsCallable(functions, 'updateDeliveryStatus');

  let processedCount = 0;
  const remainingQueue: QueuedAction[] = [];

  for (const action of queue) {
    try {
      await updateFn({ 
        orderId: action.orderId, 
        status: action.status, 
        reason: action.reason 
      });
      console.log(`[Offline Queue] Successfully synced action ${action.id}`);
      processedCount++;
    } catch (err: any) {
      const errorMsg = err.message || '';
      
      // If it's a stale local document issue (failed-precondition), it means 
      // the status is already updated or invalid. We discard it safely.
      if (errorMsg.includes('failed-precondition') || err.code === 'failed-precondition') {
        console.warn(`[Offline Queue] Discarding action ${action.id} due to stale state:`, errorMsg);
        // Do not add to remainingQueue, it's discarded
      } 
      // If it's a network error, keep it in the queue for the next retry
      else if (errorMsg.includes('network') || errorMsg.includes('internal')) {
        console.warn(`[Offline Queue] Network error for ${action.id}, keeping in queue.`);
        remainingQueue.push(action);
      } 
      // For any other unexpected errors, we discard to avoid an infinite loop
      else {
        console.error(`[Offline Queue] Unexpected error for ${action.id}, discarding:`, err);
      }
    }
  }

  // Update localStorage with remaining items
  if (remainingQueue.length > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
  } else {
    localStorage.removeItem(QUEUE_KEY);
  }

  if (processedCount > 0) {
    toast.success(`Successfully synced ${processedCount} offline updates`);
  }
};
