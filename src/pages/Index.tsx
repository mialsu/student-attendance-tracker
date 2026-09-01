import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    // A signed-in person is a teacher — there is no other kind (ADR-0003).
    navigate(user ? '/dashboard' : '/auth');
  }, [user, navigate]);

  return null;
};

export default Index;
