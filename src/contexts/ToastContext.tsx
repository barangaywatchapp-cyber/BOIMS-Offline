/**
 * Toast Notification Context & Provider
 * Manages floating toast feedback messages across the app
 */

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { AlertType } from '../components/feedback/Alert';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: AlertType;
  title?: string;
  message: string;
  durationMs?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: AlertType, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: AlertType = 'info', title?: string) => {
      const id = `TOAST-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { id, message, type, title };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="assertive"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-2 sm:px-0"
      >
        {toasts.map((toast) => {
          const typeStyles = {
            success: 'bg-emerald-900 text-white border-emerald-700',
            error: 'bg-red-900 text-white border-red-700',
            warning: 'bg-amber-900 text-white border-amber-700',
            info: 'bg-slate-900 text-white border-slate-700',
          };

          const typeIcons = {
            success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
            error: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
            warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
            info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-xl border shadow-xl flex items-start gap-3 transform transition-all duration-300 animate-in slide-in-from-top-2 ${typeStyles[toast.type]}`}
            >
              {typeIcons[toast.type]}
              <div className="flex-grow text-xs">
                {toast.title && <h5 className="font-bold text-sm mb-0.5">{toast.title}</h5>}
                <p className="leading-relaxed opacity-95">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-md shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
