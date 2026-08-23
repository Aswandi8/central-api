import { betterAuth } from "better-auth";

import { prismaAdapter } from "better-auth/adapters/prisma";

import { admin } from "better-auth/plugins";

import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],

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
