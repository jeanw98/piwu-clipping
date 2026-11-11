import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, UserDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { authStorage } from '@/lib/auth-storage';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const hydrate = useCallback(async () => {
    const token = authStorage.getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<UserDto>('/auth/me');
      setUser(data);
      connectSocket();
    } catch {
      authStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const applyAuth = useCallback(
    (data: AuthResponse) => {
      authStorage.setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      connectSocket();
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<AuthResponse>('/auth/login', {
        email,
        password,
      });
      applyAuth(data);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const { data } = await api.post<AuthResponse>('/auth/register', {
        email,
        password,
        name,
      });
      applyAuth(data);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const refreshToken = authStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      authStorage.clear();
      disconnectSocket();
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
