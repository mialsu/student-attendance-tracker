import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.isTeacher) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  }, [user, navigate]);

  return null;
};

export default Index;
