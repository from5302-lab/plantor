import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";
import type { SignupChild } from "@/lib/messages";

export type SubscriptionStatus = "active" | "expired" | "paused";

/**
 * 신청(signup) 한 건을 진짜 가족 데이터로 변환한다.
 *
 *   families/{familyId}              - 가족(부모) 1행
 *   children/{childId}               - 신청에 포함된 자녀 N행
 *   subscriptions/{subscriptionId}   - 자녀 × 선택 서비스 만큼
 *
 * 모든 쓰기는 writeBatch 로 묶여 부분 실패가 없다.
 */
export async function convertSignupToFamily(signup: {
  id: string;
  parentName: string;
  phone: string;
  children: SignupChild[];
}): Promise<{
  familyId: string;
  childIds: string[];
  subscriptionIds: string[];
}> {
  const batch = writeBatch(db);

  // 1) 가족(부모) 레코드
  const familyRef = doc(collection(db, "families"));
  batch.set(familyRef, {
    parentName: signup.parentName,
    phone: signup.phone,
    signupId: signup.id,
    createdAt: serverTimestamp(),
  });

  // 2 & 3) 자녀 + 자녀별 구독
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);

  const childIds: string[] = [];
  const subscriptionIds: string[] = [];

  for (const child of signup.children) {
    const childRef = doc(collection(db, "children"));
    batch.set(childRef, {
      familyId: familyRef.id,
      name: child.name,
      grade: child.grade,
      loginId: child.loginId,
      createdAt: serverTimestamp(),
    });
    childIds.push(childRef.id);

    for (const slug of child.selectedServices) {
      const svc = SERVICES.find((s) => s.slug === slug);
      if (!svc) continue;
      const subRef = doc(collection(db, "subscriptions"));
      batch.set(subRef, {
        familyId: familyRef.id,
        childId: childRef.id,
        serviceSlug: slug,
        monthlyPrice: svc.pricePerMonth ?? 0,
        status: "active" as SubscriptionStatus,
        startDate: Timestamp.fromDate(now),
        endDate: Timestamp.fromDate(endDate),
        createdAt: serverTimestamp(),
      });
      subscriptionIds.push(subRef.id);
    }
  }

  // 4) 원본 signup 을 'confirmed' + 백링크
  batch.update(doc(db, "signups", signup.id), {
    status: "confirmed",
    convertedFamilyId: familyRef.id,
  });

  await batch.commit();

  return { familyId: familyRef.id, childIds, subscriptionIds };
}
