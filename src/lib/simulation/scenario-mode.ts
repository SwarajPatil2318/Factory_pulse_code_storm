import "server-only";
import { cookies } from "next/headers";
import { LC01_SCENARIO_COOKIE } from "@/lib/simulation/lc01-demo-scenario";

// A missing cookie enables the fixed presentation snapshot. "off" restores the
// ordinary accelerated simulation. The browser keeps the choice on refresh.
export async function isLc01ScenarioActive() {
  return (await cookies()).get(LC01_SCENARIO_COOKIE)?.value !== "off";
}
