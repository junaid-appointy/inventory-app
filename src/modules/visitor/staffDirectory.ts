import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { buildNameIndex, type NameIndexEntry } from "../../utils/nameMatch";
import { visitorApi, type StaffMember } from "./api";
import { readStaff, saveStaff, STAFF_TTL_MS } from "./cache";
import { pendingStaffMarks } from "./offline";

async function overlayPending(staff: StaffMember[]): Promise<StaffMember[]> {
  const pending = await pendingStaffMarks();
  return staff.map((person) => {
    const local = pending.filter((event) => event.staffId === person.id).at(-1);
    const latest = [person.markedInAt, person.markedOutAt]
      .filter(Boolean)
      .sort()
      .at(-1);
    return local && (!latest || local.capturedAt >= latest)
      ? {
          ...person,
          attendanceStatus: local.eventType === "staff_in" ? "in" : "out",
          ...(local.eventType === "staff_in"
            ? { markedInAt: local.capturedAt }
            : { markedOutAt: local.capturedAt }),
        }
      : person;
  });
}

/** Cached directory for instant lookup; attendance refreshes while its screen is focused. */
export function useStaffDirectory(
  opts: { fresh?: boolean; paused?: boolean } = {},
) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const paused = useRef(opts.paused);
  paused.current = opts.paused;

  const load = useCallback(async (force: boolean) => {
    if (paused.current) return;
    const current = ++generation.current;
    const cached = await readStaff();
    if (current !== generation.current || paused.current) return;
    const cachedPeople = cached ? await overlayPending(cached.staff) : null;
    if (current !== generation.current || paused.current) return;
    if (cachedPeople) setStaff(cachedPeople);
    if (!force && cached && Date.now() - cached.loadedAt < STAFF_TTL_MS) return;
    setRefreshing(true);
    try {
      const res = await visitorApi.searchStaff("");
      if (current !== generation.current || paused.current) return;
      if (res.ok && res.data) {
        const people = await overlayPending(res.data.results);
        if (current !== generation.current || paused.current) return;
        setStaff(people);
        setOffline(false);
        setUnavailable(false);
        void saveStaff({ loadedAt: Date.now(), staff: people });
      } else {
        setOffline(Boolean(res.offline));
        setUnavailable(true);
        setStaff((cur) => cur ?? cached?.staff ?? []);
      }
    } catch (error) {
      if (current === generation.current && !paused.current) {
        console.warn("Could not refresh the staff directory", error);
        setUnavailable(true);
        setStaff((cur) => cur ?? cached?.staff ?? []);
      }
    } finally {
      if (current === generation.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!opts.fresh) void load(false);
  }, [load, opts.fresh]);

  useFocusEffect(
    useCallback(() => {
      if (!opts.fresh || opts.paused) return;
      void load(true);
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load(true);
      }, 30_000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void load(true);
      });
      return () => {
        generation.current += 1;
        clearInterval(timer);
        subscription.remove();
      };
    }, [load, opts.fresh, opts.paused]),
  );

  const reload = useCallback(() => load(true), [load]);
  const index: NameIndexEntry<StaffMember>[] = useMemo(
    () => buildNameIndex(staff ?? [], (s) => s.name),
    [staff],
  );
  return { staff, setStaff, index, offline, unavailable, refreshing, reload };
}
