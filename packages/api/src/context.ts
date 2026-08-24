import { auth } from "@gitleap/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const headers = new Headers(context.req.raw.headers);
  const authorization = headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ") && !headers.get("cookie")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token) headers.set("cookie", `better-auth.session_token=${token}`);
    headers.delete("authorization");
  }
  const session = await auth.api.getSession({
    headers,
  });
  return {
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
