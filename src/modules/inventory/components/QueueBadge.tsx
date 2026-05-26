import { Check, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StatusPill } from '../../../design';
import { onPendingChange } from '../../../sync/syncService';

export function QueueBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => onPendingChange(setCount), []);
  if (count === 0) return <StatusPill label="All synced" tone="success" Icon={Check} />;
  return <StatusPill label={`${count} waiting to send`} tone="warn" Icon={RefreshCw} />;
}
