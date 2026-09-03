import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading, checkAuth } = useAuth();

  // This route is reachable on a cold load — a bookmark, a typed address, a shared link — so it
  // has to ask whether there is a session before deciding where to send you. Without this it
  // read `user` from an empty context and sent a signed-in teacher to the login screen.
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (loading) return;
    // A signed-in person is a teacher — there is no other kind (ADR-0003).
    navigate(user ? '/dashboard' : '/auth', { replace: true });
  }, [user, loading, navigate]);

  return null;
};

export default Index;
