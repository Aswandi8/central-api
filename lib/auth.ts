import { betterAuth } from "better-auth";

import { prismaAdapter } from "better-auth/adapters/prisma";

import { admin } from "better-auth/plugins";

import { prisma } from "@/lib/prisma";

// ============================================================
// TRUSTED ORIGINS
// ============================================================

const trustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",

  process.env.VEYRA_URL,
]
  .filter((origin): origin is string => Boolean(origin?.trim()))
  .map((origin) => origin.trim().replace(/\/+$/, ""));

// ============================================================
// AUTH
// ============================================================

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,

    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      status: {
        type: "string",

        required: false,

        defaultValue: "ACTIVE",

        input: false,
      },
    },
  },

  plugins: [admin()],
});
