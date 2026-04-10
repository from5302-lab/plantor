import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SERVICES } from "@/data/site";

export type SubscriptionStatus = "active" | "expired" | "paused";

/**
 * 신청(signup) 한 건을 진짜 가족 데이터(families + children + subscriptions)
 * 로 변환하고, 같은 트랜잭션에서 signup 의 status 를 'confirmed' 로 표시한다.
 *
 * 모든 쓰기는 writeBatch 로 묶여 있어 일부만 성공하는 일이 없다.
 */
export async function convertSignupToFamily(signup: {
  id: string;
  parentName: string;
  phone: string;
  childName: string;
  childGrade: string;
  selectedServices: string[];
}): Promise<{ familyId: string; childId: string; subscriptionIds: string[] }> {
  const batch = writeBatch(db);

  // 1) 가족(부모) 레코드
  const familyRef = doc(collection(db, "families"));
  batch.set(familyRef, {
    parentName: signup.parentName,
    phone: signup.phone,
    signupId: signup.id,
    createdAt: serverTimestamp(),
  });

  // 2) 자녀 레코드 (현재는 신청 1건 = 자녀 1명)
  const childRef = doc(collection(db, "children"));
  batch.set(childRef, {
    familyId: familyRef.id,
    name: signup.childName,
    grade: signup.childGrade,
    createdAt: serverTimestamp(),
  });

  // 3) 구독 레코드 (선택한 서비스만큼)
  //    기본 종료일 = 시작일(now) + 30일
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 30);

  const subscriptionIds: string[] = [];
  for (const slug of signup.selectedServices) {
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

  // 4) 원본 signup 을 'confirmed' 로 표시 + familyId 백링크
  batch.update(doc(db, "signups", signup.id), {
    status: "confirmed",
    convertedFamilyId: familyRef.id,
  });

  await batch.commit();

  return {
    familyId: familyRef.id,
    childId: childRef.id,
    subscriptionIds,
  };
}
