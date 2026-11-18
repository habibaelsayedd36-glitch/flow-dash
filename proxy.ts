import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/auth/sign-in",
  publicRoutes: [
    "/auth/sign-in",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/share",
    "/api/leads",
    "/api/health",
  ],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
