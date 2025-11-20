import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      // Role-based redirect
      if (user.role === 'superadmin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } else {
      navigate('/auth');
    }
  }, [user, navigate]);

  return null;
};

export default Index;
