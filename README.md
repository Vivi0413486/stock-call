# 어느 날 내 주식이 전화했다

종목을 고르면 그 주식이 의인화된 캐릭터가 **전화를 겁니다**. 오늘 시세(장이 닫혔으면 마지막 종가)와 최근 공시를 근거로 자기 처지를 털어놓고, 사용자는 **음성으로 대답**하며 2분 안에 수다를 떱니다.

> "흐어엉… 형… 나야, 삼성전자… 어제 육 점 삼 퍼센트 빠졌어… 십팔만 팔천칠백 원. 형, 나 버리지 마… 근데 형, 나 공시 하나 냈거든? 들어볼래?"

OBA RUN Season 2 해커톤(2026-11-07) 출품작. **로컬 시연용**입니다.

## 흐름

종목 고르기 → (평단·수량 입력, 선택) → 📞 전화가 걸려옴 → 받기 → 주식과 통화(자막 표시) → 끊기 → 통화 기록 카드

- 기분은 등락률로 결정됩니다: 오열(-3% 이하) · 시무룩 · 심심함 · 우쭐 · 기고만장(+3% 이상)
- 평단을 넣으면 수익률을 캐릭터가 언급합니다 ("형 나 산 거 후회하지?")
- 호칭은 형 / 누나 / 언니 / 오빠 중 선택
- 대형주는 듬직한 척, 성장주는 하이텐션

## 데이터·음성

| 역할 | 출처 | 비고 |
| --- | --- | --- |
| 시세·공시·재무 | [Phoenix AI DATA API](https://openapi.chickstockfi.com/docs) (알프소프트) | 서버 라우트에서만 호출, 종목당 5분 캐시 |
| 음성 통화 | [Vapi](https://docs.vapi.ai) Web SDK | 브라우저 Public key, 임시(transient) assistant |
| STT / TTS | ElevenLabs scribe_v2_realtime (ko, `?stt=`로 openai·azure·deepgram 전환) / **MiniMax speech-02-hd 한국어 보이스**(기분→감정, `?tts=`로 cartesia·azure·11labs·openai 전환) | TTS는 아라비아 숫자를 영어로 읽어서 한글 수사로 변환해 보냄 |
| LLM | Vapi assistant 안의 OpenAI gpt-4o | 별도 LLM 키 불필요 |

쓰는 Phoenix 엔드포인트: `GET /key`(연결 확인, 한도 미차감) · `GET /quotes/{symbol}` · `GET /disclosures?symbol=` · `GET /companies/{symbol}/financials` · `GET /symbols?q=`

화면과 캐릭터 대사에는 API가 준 **기준 시각을 그대로** 표시합니다 ("11/6 15:30 종가 기준"). 실시간인 척하지 않고, 받지 못한 데이터는 캐릭터가 말하지 않습니다.

## 실행

```sh
pnpm install
cp .env.example .env.local   # 키 입력
pnpm dev -p 3188             # http://localhost:3188
```

| 환경변수 | 어디서 | 없으면 |
| --- | --- | --- |
| `PHOENIX_DATA_KEY` | [Builder 신청](https://openapi.chickstockfi.com/request?product=builder) (행사 코드 OBS2) → 포털에서 DATA 키 생성. `ck_live_` 로 시작 | 샘플 데이터 모드 (화면에 "샘플" 표시) |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | [Vapi 대시보드](https://dashboard.vapi.ai/?coupon-code=obavapi26) → API Keys → **Public** key | 듣기 모드 (브라우저 TTS로 첫 마디만) |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | 선택. 대시보드 assistant를 쓸 때 | 코드 안 임시 assistant 사용 (권장) |
| `NEXT_PUBLIC_VAPI_VOICE_ID` | 선택. 공급자별 voiceId (MiniMax `Korean_CockyGuy` 등, Azure `ko-KR-SunHiNeural`, 11labs `ryan`). URL `?voice=`가 우선 | 대형주 `Korean_CheerfulBoyfriend` · 성장주 `Korean_CheerfulCoolJunior` |
| `NEXT_PUBLIC_VAPI_TRANSCRIBER` | 선택. 한국어 STT: `11labs`(scribe_v2_realtime) · `openai`(gpt-4o-transcribe) · `azure`(ko-KR) · `deepgram`(nova-3). URL `?stt=openai`가 우선 | `11labs` |
| `NEXT_PUBLIC_VAPI_TTS` | 선택. 한국어 TTS: `minimax`(한국어 보이스 49종+감정) · `cartesia` · `azure` · `11labs` · `openai`. URL `?tts=`가 우선 | `minimax` |
| `NEXT_PUBLIC_VAPI_TTS_SPEED` | 선택. 말하기 속도. URL `?speed=1.4`가 우선 | 대형주 1.15 · 성장주 1.25 |

Private key는 어디에도 넣지 않습니다. Phoenix 키는 `NEXT_PUBLIC_` 접두사 없이 서버에서만 읽습니다.

## 검증

```sh
pnpm typecheck   # tsc
pnpm lint        # eslint
pnpm test        # node:test — openapi.json 공식 예제가 Zod 스키마를 통과하는지, 기분 경계값, 한글 수사 변환
pnpm build
```

마이크 없이 대화를 검증하려면(개발 모드 전용) 브라우저 콘솔에서 `window.__vapi.send({type:"add-message",message:{role:"user",content:"응, 뭔데?"}})` 로 발화를 주입할 수 있습니다. 헤드리스 Chrome은 `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` 플래그로 통화가 연결됩니다.

테스트는 기본적으로 openapi.json 을 내려받습니다. 오프라인이면 `OPENAPI_JSON=/path/to/openapi.json pnpm test`.

## 비용·한도 보호

- 통화 1회 **최대 2분**: Vapi `maxDurationSeconds` + 브라우저 타이머 + 종료 문구(`endCallPhrases`) 3겹
- Phoenix: 같은 종목 5분 서버 캐시, 검색 400ms 디바운스, 종목당 동시 요청 3개(팀 한도 4개 이내)
- 평단·수량·통화 기록은 브라우저 localStorage에만 저장

## 구조

```
src/lib/phoenix.ts   Phoenix 클라이언트 (server-only, 캐시, 부분 실패 허용)
src/lib/schema.ts    Zod 스키마 (openapi.json 1.20.0 필드명 기준)
src/lib/mood.ts      등락률 → 기분, 평단 → 수익률 (결정적 로직, LLM 미사용)
src/lib/prompt.ts    첫 마디 + 시스템 프롬프트 생성
src/lib/spoken.ts    숫자 → 한글 수사 (TTS 발음용)
src/components/      stock-picker → incoming-call → call-screen → call-card
src/app/api/         /stock/[symbol] · /search · /health(연결 확인용, 화면에는 표시하지 않음)
```

데이터 출처: Phoenix AI (알프소프트). 투자 권유가 아닙니다.
