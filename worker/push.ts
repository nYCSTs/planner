import type { Env } from "./index";

export async function pushRoutes(_req: Request, _env: Env, _path: string): Promise<Response | null> {
  return null;
}

export async function runPushCron(_env: Env): Promise<void> {}
