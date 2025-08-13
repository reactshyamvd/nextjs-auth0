import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "./lib/auth0"
import { PostHog } from "posthog-node"

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request)
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith("/auth")) return authRes

  const session = await auth0.getSession(request)
  if (!session) {
    const { origin } = new URL(request.url)
    return NextResponse.redirect(`${origin}/auth/login`)
  }

  const response = NextResponse.next()

  //Ensure ph_distinct_id exists
  const distinctId: string =
    request.cookies.get("ph_distinct_id")?.value ??
    session.user.opaqueID ??
    crypto.randomUUID()
  console.log("the distinct id", request.cookies.get("ph_distinct_id"), session.user.opaqueID, crypto.randomUUID())
  response.cookies.set("ph_distinct_id", distinctId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })

  //Handle ss_ui cookie for UI variant
  const ssUiCookie = request.cookies.get("ss_ui")?.value
  if (!ssUiCookie) {
    const POSTHOG_KEY = process.env.POSTHOG_KEY
    const POSTHOG_HOST = process.env.POSTHOG_HOST
    if (!POSTHOG_KEY || !POSTHOG_HOST) {
      throw new Error("PostHog env vars are missing")
    }
    const posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST })

    const enabled = await posthog.isFeatureEnabled("smartsearch_new_ui", distinctId)

    response.cookies.set("ss_ui", enabled ? "always" : "never", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: true,
    })

    await posthog.shutdown()
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
    "/api/protected/:path*",
  ],
}
