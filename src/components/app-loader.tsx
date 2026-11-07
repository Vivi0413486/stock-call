"use client";

import dynamic from "next/dynamic";

/** 앱 전체가 localStorage(평단·호칭·기록)에 기대므로 서버 렌더를 끄고 브라우저에서만 그린다 */
const App = dynamic(() => import("./app").then((m) => m.App), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center px-4 text-sm text-muted">전화기 켜는 중…</main>
  ),
});

export function AppLoader() {
  return <App />;
}
