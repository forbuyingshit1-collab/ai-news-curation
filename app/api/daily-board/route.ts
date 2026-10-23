import { getDailyBoards } from "@/lib/daily-board-store";
import { requireApiSession } from "@/lib/auth";

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const date = new URL(request.url).searchParams.get("date");
  const boards = await getDailyBoards();
  return Response.json(date ? boards.find((board) => board.boardDate === date) ?? null : boards);
}
