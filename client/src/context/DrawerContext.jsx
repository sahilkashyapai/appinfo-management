import { createContext, useCallback, useContext, useState } from 'react';

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

export function useDrawers() {
  return useContext(DrawerContext);
}
