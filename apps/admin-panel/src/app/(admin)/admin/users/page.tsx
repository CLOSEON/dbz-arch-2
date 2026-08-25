'use client';

import { useState, useEffect } from 'react';
import { getAllUsers } from '@/lib/queries/users';
import { AppUser } from '@/types';
import { Users, Search, Phone, Shield } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || '').includes(search) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-10 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">User Management</h1>
        <p className="text-sm text-slate-500 mt-0.5">View and manage all registered accounts</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="w-full bg-white border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-brand/20 transition-all"
          placeholder="Search by name, phone or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-white rounded-3xl animate-pulse shadow-sm border border-slate-50" />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center shadow-sm border border-slate-50">
            <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-400">No users found</p>
          </div>
        ) : (
          filtered.map((u) => (
            <div key={u.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-50 flex items-center justify-between group hover:border-brand/20 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm ${
                  u.role === 'admin' ? 'bg-purple-50 text-purple-600' :
                  u.role === 'vendor' ? 'bg-amber-50 text-amber-600' :
                  u.role === 'delivery' ? 'bg-brand-50 text-brand' :
                  'bg-slate-50 text-slate-600'
                }`}>
                  {u.role === 'admin' ? '🛡️' : u.role === 'vendor' ? '🏪' : u.role === 'delivery' ? '🛵' : '👤'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900">{u.name || 'Anonymous'}</h4>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                      u.role === 'vendor' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      u.role === 'delivery' ? 'bg-brand-50 text-brand border-brand-100' :
                      'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                      <Phone className="w-2.5 h-2.5" /> {u.phone ? `+91 ${(u.phone).replace(/\D/g,'').slice(-10)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">Joined</p>
                <p className="text-[10px] font-bold text-slate-500">
                  {u.created_at ? formatDate(u.created_at) : 'N/A'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
