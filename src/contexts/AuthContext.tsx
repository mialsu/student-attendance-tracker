import { createContext, useContext, useState, ReactNode } from 'react';
import { authApi } from '../api/auth';
import type { User } from '../api/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, registrationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  updateEmail: (newEmail: string, currentPassword: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const checkAuth = async () => {
    // Skip if already authenticated or already checked
    if (initialized || user) return;

    setLoading(true);
    try {
      // First, try to refresh token silently (using HTTP-only cookie)
      // This will set the access token if a valid refresh token exists
      await authApi.refreshToken();

      // If refresh succeeds, get the current user
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      // No valid session - user needs to login
      setUser(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    const response = await authApi.login({ email, password });
    setUser(response.user);
    setInitialized(true);
  };

  const signup = async (email: string, password: string, registrationCode: string): Promise<void> => {
    const response = await authApi.signup({ email, password, registration_code: registrationCode });
    setUser(response.user);
    setInitialized(true);
  };

  const logout = async (): Promise<void> => {
    await authApi.logout();
    setUser(null);
    setInitialized(false);
  };

  const updateEmail = async (newEmail: string, currentPassword: string): Promise<void> => {
    const updatedUser = await authApi.updateEmail(newEmail, currentPassword);
    setUser(updatedUser);
  };

  const updatePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await authApi.updatePassword(currentPassword, newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        checkAuth,
        login,
        signup,
        logout,
        updateEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
