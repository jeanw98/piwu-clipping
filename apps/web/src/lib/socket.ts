import { io, type Socket } from 'socket.io-client';
import { authStorage } from './auth-storage';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/realtime`, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        token: authStorage.getAccessToken() ?? '',
      },
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  s.auth = { token: authStorage.getAccessToken() ?? '' };
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
