import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  email: string;
  isTeacher: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, isTeacher: boolean) => Promise<boolean>;
  logout: () => void;
  updateEmail: (newEmail: string, currentPassword: string) => Promise<boolean>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const users = JSON.parse(localStorage.getItem('users') || '[]') as Array<{ email: string; password: string; isTeacher: boolean }>;
    const foundUser = users.find((u) => u.email === email && u.password === password);
    
    if (foundUser) {
      const userData = { email: foundUser.email, isTeacher: foundUser.isTeacher };
      setUser(userData);
      localStorage.setItem('currentUser', JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const signup = async (email: string, password: string, isTeacher: boolean): Promise<boolean> => {
    const users = JSON.parse(localStorage.getItem('users') || '[]') as Array<{ email: string; password: string; isTeacher: boolean }>;

    if (users.find((u) => u.email === email)) {
      return false;
    }
    
    const newUser = { email, password, isTeacher };
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    const userData = { email, isTeacher };
    setUser(userData);
    localStorage.setItem('currentUser', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const updateEmail = async (newEmail: string, currentPassword: string): Promise<boolean> => {
    if (!user) return false;

    const users = JSON.parse(localStorage.getItem('users') || '[]') as Array<{ email: string; password: string; isTeacher: boolean }>;
    const currentUserIndex = users.findIndex((u) => u.email === user.email && u.password === currentPassword);

    if (currentUserIndex === -1) return false;

    // Check if new email is already taken by another user
    if (users.find((u, idx) => u.email === newEmail && idx !== currentUserIndex)) {
      return false;
    }

    users[currentUserIndex].email = newEmail;
    localStorage.setItem('users', JSON.stringify(users));

    const userData = { email: newEmail, isTeacher: user.isTeacher };
    setUser(userData);
    localStorage.setItem('currentUser', JSON.stringify(userData));

    return true;
  };

  const updatePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) return false;

    const users = JSON.parse(localStorage.getItem('users') || '[]') as Array<{ email: string; password: string; isTeacher: boolean }>;
    const currentUserIndex = users.findIndex((u) => u.email === user.email && u.password === currentPassword);

    if (currentUserIndex === -1) return false;

    users[currentUserIndex].password = newPassword;
    localStorage.setItem('users', JSON.stringify(users));

    return true;
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, updateEmail, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
