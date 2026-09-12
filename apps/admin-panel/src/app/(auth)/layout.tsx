import { Toaster } from '@/components/shared/Toaster';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
