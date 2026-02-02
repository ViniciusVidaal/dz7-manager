import { collection, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../services/firebase";

const isAbortError = (err) => {
  if (!err) return false;
  if (err.code === "cancelled" || err.code === "aborted") return true;
  if (err.name === "AbortError") return true;
  const message = String(err.message || "");
  return message.toLowerCase().includes("aborted a request");
};

export default function useCollection(collectionName, orderField = "createdAt", options = {}) {
  const { enabled = true, realtime = true, filters = [], orderDirection = "desc" } = options;
  const filtersKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filtersKey]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let active = true;
    setLoading(true);
    const constraints = [];
    if (Array.isArray(stableFilters) && stableFilters.length > 0) {
      stableFilters.forEach((filter) => {
        if (!filter || filter.length < 3) return;
        const [field, op, value] = filter;
        constraints.push(where(field, op, value));
      });
    }
    if (orderField) {
      constraints.push(orderBy(orderField, orderDirection));
    }
    const q = query(collection(db, collectionName), ...constraints);

    if (realtime) {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!active) return;
          const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setData(items);
          setLoading(false);
          setError(null);
        },
        (err) => {
          if (!active || isAbortError(err)) {
            return;
          }
          setError(err);
          setLoading(false);
          setData([]);
        }
      );

      return () => {
        active = false;
        unsubscribe();
      };
    }

    (async () => {
      try {
        const snapshot = await getDocs(q);
        if (!active) return;
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setData(items);
        setLoading(false);
        setError(null);
      } catch (err) {
        if (!active || isAbortError(err)) return;
        setError(err);
        setLoading(false);
        setData([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [collectionName, orderField, enabled, realtime, orderDirection, filtersKey, stableFilters]);

  return { data, loading, error };
}

