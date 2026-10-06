import { createContext, useCallback, useContext, useState } from 'react';
import { warnMissingProvider } from '../utils/missingProvider';

const DrawerContext = createContext(null);

// Shared control for the two overlay panels that can be triggered from many pages:
// the Employee detail drawer and the Event RSVP modal.
export function DrawerProvider({ children }) {
  const [employeeId, setEmployeeId] = useState(null);
  const [rsvpEventId, setRsvpEventId] = useState(null);

  const openEmployee = useCallback((id) => setEmployeeId(id), []);
  const closeEmployee = useCallback(() => setEmployeeId(null), []);
  const openRsvp = useCallback((id) => setRsvpEventId(id), []);
  const closeRsvp = useCallback(() => setRsvpEventId(null), []);

  return (
    <DrawerContext.Provider value={{ employeeId, openEmployee, closeEmployee, rsvpEventId, openRsvp, closeRsvp }}>
      {children}
    </DrawerContext.Provider>
  );
}

const NO_PROVIDER = Object.freeze({
  employeeId: null,
  openEmployee: () => {},
  closeEmployee: () => {},
  rsvpEventId: null,
  openRsvp: () => {},
  closeRsvp: () => {},
});

export function useDrawers() {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    warnMissingProvider('useDrawers');
    return NO_PROVIDER;
  }
  return ctx;
}
