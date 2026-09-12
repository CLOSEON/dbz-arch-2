import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SupportTicket, TicketStatus, TicketReply, UserRole } from '@/types';

export async function submitTicket(data: {
  submitter_id: string;
  submitter_name: string;
  role: UserRole;
  subject: string;
  message: string;
}): Promise<void> {
  await addDoc(collection(db, 'support_tickets'), {
    ...data,
    status: 'open',
    replies: [],
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
}

export async function getMyTickets(userId: string): Promise<SupportTicket[]> {
  const q = query(collection(db, 'support_tickets'), where('submitter_id', '==', userId));
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
  return tickets.sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));
}

export async function getAllTickets(statusFilter: TicketStatus | 'all' = 'all'): Promise<SupportTicket[]> {
  let q;
  if (statusFilter === 'all') {
    q = query(collection(db, 'support_tickets'), orderBy('created_at', 'desc'));
  } else {
    q = query(collection(db, 'support_tickets'), where('status', '==', statusFilter));
  }
  const snap = await getDocs(q);
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportTicket));
  if (statusFilter !== 'all') {
    tickets.sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));
  }
  return tickets;
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  await updateDoc(doc(db, 'support_tickets', ticketId), {
    status,
    updated_at: Timestamp.now(),
  });
}

export async function addTicketReply(
  ticketId: string,
  reply: Omit<TicketReply, 'timestamp'>,
  currentReplies: TicketReply[]
): Promise<void> {
  const newReply: TicketReply = { ...reply, timestamp: Timestamp.now() as any };
  await updateDoc(doc(db, 'support_tickets', ticketId), {
    replies: [...currentReplies, newReply],
    status: 'in_progress',
    updated_at: Timestamp.now(),
  });
}
