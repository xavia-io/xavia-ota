import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [router]);

  return <>{children}</>;
}
