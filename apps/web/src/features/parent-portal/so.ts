// Somali wording for the Parent Portal — one place, so every page uses the
// same words for the same thing.

export const SO_STATUS: Record<string, string> = {
  ACTIVE: "Firfircoon",
  INACTIVE: "Aan firfircoonayn",
  PENDING_SETUP: "Sugaya diyaarin",
  SUSPENDED: "La hakiyay",
  GRADUATED: "Qalin-jabiyay",
  COMPLETED: "Dhammaystiray",
  TRANSFERRED: "La wareejiyay",
  WITHDRAWN: "Ka baxay",
  ARCHIVED: "Kaydsan",
};

export const SO_ATTENDANCE: Record<string, string> = {
  PRESENT: "Joogay",
  ABSENT: "Maqnaa",
  LATE: "Daahay",
  EXCUSED: "Fasax",
};

export const SO_INVOICE_STATUS: Record<string, string> = {
  PAID: "La bixiyay",
  PARTIALLY_PAID: "Qayb la bixiyay",
  UNPAID: "Lama bixin",
};

export const SO_SUBMISSION_STATUS: Record<string, string> = {
  VERIFIED: "La xaqiijiyay",
  PENDING: "Sugaya",
  REJECTED: "La diiday",
};

export const SO_RELATIONSHIP: Record<string, string> = {
  FATHER: "Aabbe",
  MOTHER: "Hooyo",
  GUARDIAN: "Mas'uul",
  OTHER: "Qaraabo kale",
};

export const SO_PAYMENT_METHOD: Record<string, string> = {
  CASH: "Lacag caddaan ah",
  BANK_TRANSFER: "Bangi",
  MOBILE_MONEY: "Lacag mobile",
  CARD: "Kaar",
  OTHER: "Hab kale",
};

export function soStatus(map: Record<string, string>, value: string): string {
  return map[value] ?? value.replace(/_/g, " ");
}

// Dates in Somali (browser Intl), falling back gracefully.
export function soDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof value === "string" ? new Date(value) : value;
  try {
    return d.toLocaleDateString("so-SO", options ?? { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d.toLocaleDateString(undefined, options);
  }
}

export const SO_SEX: Record<string, string> = { MALE: "Wiil", FEMALE: "Gabadh" };
