import { prisma } from "@/lib/prisma";

export type LoginValidationResult =
  | {
      success: true;
      user: {
        id: string;
        email: string;
        name: string | null;
        status: string;
        banned: boolean;
        banExpires: Date | null;
        emailVerified: boolean;
      };
    }
  | {
      success: false;
      status: number;
      code:
        | "USER_NOT_FOUND"
        | "ACCOUNT_INACTIVE"
        | "ACCOUNT_SUSPENDED"
        | "ACCOUNT_BANNED"
        | "EMAIL_NOT_VERIFIED";
      error: string;
    };

export async function validateLoginUser(
  email: string,
): Promise<LoginValidationResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      banned: true,
      banExpires: true,
      emailVerified: true,
    },
  });

  /**
   * USER TIDAK DITEMUKAN
   */
  if (!user) {
    return {
      success: false,
      status: 401,
      code: "USER_NOT_FOUND",
      error: "Account with this email was not found",
    };
  }

  /**
   * Prisma kamu mengembalikan:
   *
   * boolean | null
   *
   * Kita normalisasi menjadi boolean.
   */
  const isBanned = user.banned === true;

  /**
   * BANNED
   *
   * banned = true
   * dan banExpires null = permanent ban
   *
   * banned = true
   * dan banExpires > sekarang = masih banned
   */
  if (isBanned) {
    const now = new Date();

    if (!user.banExpires || user.banExpires > now) {
      return {
        success: false,
        status: 403,
        code: "ACCOUNT_BANNED",
        error: "Your account has been banned",
      };
    }
  }

  /**
   * STATUS INACTIVE
   */
  if (user.status === "INACTIVE") {
    return {
      success: false,
      status: 403,
      code: "ACCOUNT_INACTIVE",
      error: "Your account is inactive",
    };
  }

  /**
   * STATUS SUSPENDED
   */
  if (user.status === "SUSPENDED") {
    return {
      success: false,
      status: 403,
      code: "ACCOUNT_SUSPENDED",
      error: "Your account has been suspended",
    };
  }

  /**
   * STATUS BANNED
   */
  if (user.status === "BANNED") {
    return {
      success: false,
      status: 403,
      code: "ACCOUNT_BANNED",
      error: "Your account has been banned",
    };
  }

  /**
   * HANYA ACTIVE YANG BOLEH LOGIN
   */
  if (user.status !== "ACTIVE") {
    return {
      success: false,
      status: 403,
      code: "ACCOUNT_INACTIVE",
      error: "Your account is not active",
    };
  }

  /**
   * EMAIL VERIFICATION
   */
  if (!user.emailVerified) {
    return {
      success: false,
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
      error: "Your email address has not been verified",
    };
  }

  /**
   * SEMUA VALID
   */
  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      banned: isBanned,
      banExpires: user.banExpires,
      emailVerified: user.emailVerified,
    },
  };
}
