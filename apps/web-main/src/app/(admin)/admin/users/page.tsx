'use client';

import React from 'react';
import { UserManagementHub } from '@/components/admin/UserManagementHub';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <UserManagementHub />
    </div>
  );
}
