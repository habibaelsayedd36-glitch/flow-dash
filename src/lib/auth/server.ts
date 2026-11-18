import { createNeonAuth } from "@neon/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

export async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user) throw new Error("Unauthorized: please sign in.");
  return session.user;
}

export async function requireApiUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
