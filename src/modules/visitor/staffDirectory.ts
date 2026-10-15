import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildNameIndex, type NameIndexEntry } from '../../utils/nameMatch';
import { visitorApi, type StaffMember } from './api';
import { readStaff, saveStaff, STAFF_TTL_MS } from './cache';

/**
 * The staff directory for the gate, kept on the phone so searching is
 * instant and works offline. Indexed once for the name matcher (typos,
 * sound-alikes, Hindi typing), not per keystroke.
 *
 * `fresh: true` asks the server every time the screen opens (Staff in and
 * out needs today's in/out status); otherwise the saved copy is used and
 * refreshed only when older than STAFF_TTL_MS.
 */
export function useStaffDirectory(opts: { fresh?: boolean } = {}) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async (force: boolean) => {
    const cached = await readStaff();
    if (cached) setStaff((cur) => cur ?? cached.staff);
    if (!force && cached && Date.now() - cached.loadedAt < STAFF_TTL_MS) return;
    const res = await visitorApi.searchStaff('');
    if (res.ok && res.data) {
      setStaff(res.data.results);
      setOffline(false);
      void saveStaff({ loadedAt: Date.now(), staff: res.data.results });
    } else {
      setOffline(Boolean(res.offline));
      setStaff((cur) => cur ?? cached?.staff ?? []);
    }
  }, []);

  useEffect(() => {
    void load(Boolean(opts.fresh));
  }, [load, opts.fresh]);

  const index: NameIndexEntry<StaffMember>[] = useMemo(() => buildNameIndex(staff ?? [], (s) => s.name), [staff]);

  return { staff, setStaff, index, offline, reload: () => load(true) };
}
