import { DashboardClient } from "@/components/dashboard-client";
import { getDashboardData } from "@/lib/dashboard";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requirePageSession();
  const dashboardState = await getDashboardData();
  return <DashboardClient initialState={dashboardState} />;
}
