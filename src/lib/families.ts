import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
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
  userId?: string | null;
  couponCode?: string | null;
  couponDiscount?: number;
  parentId?: string | null;
  referralCode?: string | null;
  referrerId?: string | null;
  referralDiscount?: number;
}): Promise<{
  familyId: string;
  childIds: string[];
  subscriptionIds: string[];
}> {
  // 중복 방지: 이미 이 signupId로 family가 있으면 그대로 반환
  const existing = await getDocs(query(collection(db, "families"), where("signupId", "==", signup.id)));
  if (!existing.empty) {
    const existingFamily = existing.docs[0];
    const existingChildren = await getDocs(query(collection(db, "children"), where("familyId", "==", existingFamily.id)));
    return {
      familyId: existingFamily.id,
      childIds: existingChildren.docs.map((d) => d.id),
      subscriptionIds: [],
    };
  }

  const batch = writeBatch(db);

  // 1) 가족(부모) 레코드
  const familyRef = doc(collection(db, "families"));
  batch.set(familyRef, {
    parentName: signup.parentName,
    phone: signup.phone,
    signupId: signup.id,
    userId: signup.userId ?? null,
    parentPlantorId: signup.parentId?.toLowerCase() ?? null,
    couponCode: signup.couponCode ?? null,
    couponDiscount: signup.couponDiscount ?? 0,
    referralCode: signup.referralCode ?? null,
    referrerId: signup.referrerId ?? null,
    referralDiscount: signup.referralDiscount ?? 0,
    createdAt: serverTimestamp(),
  });

  if (signup.parentId) {
    const refCodeRef = doc(db, "referralCodes", signup.parentId.toLowerCase());
    batch.set(refCodeRef, { familyId: familyRef.id, referrerName: signup.parentName, createdAt: serverTimestamp() });
  }

  // 2 & 3) 자녀 + 자녀별 구독
  const now = new Date();
  // 다음달 말일 (예: 4월 가입 → 5월 31일)
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const childIds: string[] = [];
  const subscriptionIds: string[] = [];

  for (const child of signup.children) {
    const childRef = doc(collection(db, "children"));
    batch.set(childRef, {
      familyId: familyRef.id,
      userId: signup.userId ?? null,   // ← /learn 페이지 쿼리에 필요
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
        agencyFee: svc.agencyFee ?? 0,
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
