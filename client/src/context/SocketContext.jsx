import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

function socketBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return apiUrl.replace(/\/api\/?$/, '');
}

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return undefined;

    const token = localStorage.getItem('aii_token');
    const socket = io(socketBaseUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('message:new', ({ conversationId, message }) => {
      qc.setQueryData(['chat-messages', conversationId], (old) => {
        if (!old) return old;
        if (old.some((m) => m._id === message._id)) return old;
        return [...old, message];
      });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    });
    socket.on('conversation:new', () => qc.invalidateQueries({ queryKey: ['chat-conversations'] }));
    socket.on('conversation:updated', () => qc.invalidateQueries({ queryKey: ['chat-conversations'] }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id, qc]);

  return <SocketContext.Provider value={{ socket: socketRef.current, connected }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
