import React, { useEffect, useState } from 'react';
import { StatusPill } from '../design';
import { onPendingChange } from '../sync/syncService';

export function QueueBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => onPendingChange(setCount), []);
  if (count === 0) return <StatusPill label="All synced" tone="success" leadingIcon="✓" />;
  return <StatusPill label={`${count} waiting to send`} tone="warn" leadingIcon="↻" />;
}
