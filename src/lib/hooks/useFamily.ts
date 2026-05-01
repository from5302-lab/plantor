"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** userId로 familyId와 parentName을 조회한다. */
export function useFamily(userId: string) {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "families"), where("userId", "==", userId));
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        setFamilyId(null);
        setParentName(null);
      } else {
        const data = snap.docs[0].data();
        setFamilyId(snap.docs[0].id);
        setParentName(data.parentName ?? null);
      }
      setLoaded(true);
    });
  }, [userId]);

  return { familyId, parentName, loaded };
}
