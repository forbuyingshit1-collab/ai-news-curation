import "server-only";

import { getDailyBoards } from "@/lib/daily-board-store";
import { getDashboardState } from "@/lib/persistent-store";

export async function getDashboardData() {
  const [state, dailyBoards] = await Promise.all([getDashboardState(), getDailyBoards()]);
  return { ...state, dailyBoards };
}
