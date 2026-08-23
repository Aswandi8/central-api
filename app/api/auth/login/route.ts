import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { validateLoginUser } from "@/lib/auth/login";

type LoginBody = {
  email?: unknown;
  password?: unknown;
  rememberMe?: unknown;
};

export async function POST(request: Request) {
  try {
    /**
     * --------------------------------------------------
     * 1. Parse body
     * --------------------------------------------------
     */
    let body: LoginBody;

    try {
      body = (await request.json()) as LoginBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "Invalid request body",
        },
        {
          status: 400,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 2. Validate email
     * --------------------------------------------------
     */
    if (typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_REQUIRED",
          error: "Email is required",
        },
        {
          status: 400,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 3. Validate password
     * --------------------------------------------------
     */
    if (typeof body.password !== "string" || !body.password) {
      return NextResponse.json(
        {
          success: false,
          code: "PASSWORD_REQUIRED",
          error: "Password is required",
        },
        {
          status: 400,
        },
      );
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    /**
     * --------------------------------------------------
     * 4. Basic email format
     * --------------------------------------------------
     */

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_EMAIL",
          error: "Invalid email address",
        },
        {
          status: 400,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 5. Validate user BEFORE Better Auth
     * --------------------------------------------------
     */
    const validation = await validateLoginUser(email);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          code: validation.code,
          error: validation.error,
        },
        {
          status: validation.status,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 6. Login menggunakan Better Auth
     *
     * Kita TIDAK membuat sistem password sendiri.
     *
     * Better Auth tetap menjadi satu-satunya engine
     * untuk verifikasi password dan pembuatan session.
     * --------------------------------------------------
     */

    const authHeaders = new Headers(request.headers);

    /**
     * Pastikan origin tetap berasal dari Veyra.
     */
    if (!authHeaders.has("Origin")) {
      const origin = process.env.VEYRA_URL ?? "http://localhost:3000";

      authHeaders.set("Origin", origin);
    }

    let authResponse: Response;

    try {
      authResponse = await auth.api.signInEmail({
        body: {
          email,
          password,
          rememberMe:
            typeof body.rememberMe === "boolean" ? body.rememberMe : true,
        },
        headers: authHeaders,
        asResponse: true,
      });
    } catch (error) {
      console.error("Better Auth sign-in error:", error);

      return NextResponse.json(
        {
          success: false,
          code: "AUTHENTICATION_FAILED",
          error: "Authentication failed",
        },
        {
          status: 401,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 7. Better Auth password error
     * --------------------------------------------------
     */

    if (!authResponse.ok) {
      const contentType = authResponse.headers.get("content-type");

      let authData: unknown = null;

      if (contentType?.includes("application/json")) {
        try {
          authData = await authResponse.json();
        } catch {
          authData = null;
        }
      } else {
        try {
          authData = await authResponse.text();
        } catch {
          authData = null;
        }
      }

      /**
       * Better Auth default:
       *
       * INVALID_EMAIL_OR_PASSWORD
       *
       * Karena email sudah kita validasi sebelumnya,
       * pada tahap ini email pasti ditemukan.
       *
       * Jadi error tersebut berarti password salah.
       */
      const authCode =
        typeof authData === "object" &&
        authData !== null &&
        "code" in authData &&
        typeof authData.code === "string"
          ? authData.code
          : null;

      if (authCode === "INVALID_EMAIL_OR_PASSWORD") {
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_PASSWORD",
            error: "The password you entered is incorrect",
          },
          {
            status: 401,
          },
        );
      }

      /**
       * Fallback error Better Auth.
       */
      const authMessage =
        typeof authData === "object" &&
        authData !== null &&
        "message" in authData &&
        typeof authData.message === "string"
          ? authData.message
          : "Authentication failed";

      return NextResponse.json(
        {
          success: false,
          code: authCode ?? "AUTHENTICATION_FAILED",
          error: authMessage,
        },
        {
          status: authResponse.status,
        },
      );
    }

    /**
     * --------------------------------------------------
     * 8. LOGIN BERHASIL
     * --------------------------------------------------
     */

    const responseBody = await authResponse.text();

    const response = new NextResponse(responseBody, {
      status: authResponse.status,
    });

    /**
     * Content-Type
     */
    const contentType = authResponse.headers.get("content-type");

    if (contentType) {
      response.headers.set("content-type", contentType);
    }

    /**
     * --------------------------------------------------
     * 9. Forward Better Auth cookies
     *
     * Ini sangat penting.
     *
     * Tanpa Set-Cookie:
     *
     * login terlihat berhasil
     * tetapi browser tidak memiliki session.
     * --------------------------------------------------
     */

    const setCookies = authResponse.headers.getSetCookie();

    for (const cookie of setCookies) {
      response.headers.append("set-cookie", cookie);
    }

    /**
     * --------------------------------------------------
     * 10. Return
     * --------------------------------------------------
     */

    return response;
  } catch (error) {
    console.error("Central API login error:", error);

    return NextResponse.json(
      {
        success: false,
        code: "AUTH_SERVER_ERROR",
        error: "Authentication server is temporarily unavailable",
      },
      {
        status: 503,
      },
    );
  }
}
