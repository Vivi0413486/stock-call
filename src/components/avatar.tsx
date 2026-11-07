export type AvatarState = "idle" | "ringing" | "speaking" | "listening" | "done";

type Props = {
  emoji: string;
  color: string;
  state: AvatarState;
  size?: "sm" | "lg";
};

/** 종목 캐릭터 얼굴. 상태에 따라 흔들리거나(벨) 숨 쉬듯 커진다(말하는 중) */
export function Avatar({ emoji, color, state, size = "lg" }: Props) {
  const dim = size === "lg" ? "h-36 w-36 text-7xl" : "h-12 w-12 text-2xl";
  const anim =
    state === "ringing" ? "ring-shake" : state === "speaking" ? "speaking" : state === "listening" ? "listening" : "";
  return (
    <div className={`relative ${size === "lg" ? "h-36 w-36" : "h-12 w-12"}`}>
      {state === "ringing" && <div className="ripple absolute inset-0 rounded-full" aria-hidden />}
      <div
        className={`relative flex ${dim} items-center justify-center rounded-full border-4 border-white/10 shadow-2xl ${anim}`}
        style={{ background: `radial-gradient(circle at 35% 30%, ${color}cc, ${color}66 70%, #0b0f1a 100%)` }}
        aria-hidden
      >
        <span className="drop-shadow-lg">{emoji}</span>
      </div>
    </div>
  );
}
