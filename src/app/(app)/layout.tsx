// 공유 레이아웃: 사이드바(Shell)를 모든 (app) 라우트에 한 번만 렌더.
// /landing 은 이 그룹 밖이라 Shell 없음. 라우트 전환 시 Shell 은 유지되고 본문만 교체.
import { Shell } from "@/components/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
