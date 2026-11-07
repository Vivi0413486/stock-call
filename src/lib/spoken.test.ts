import assert from "node:assert/strict";
import test from "node:test";
import { koDecimal, koInteger, spokenEok, spokenKrw, spokenPct } from "./spoken";

test("정수 한글 읽기", () => {
  assert.equal(koInteger(0), "영");
  assert.equal(koInteger(1), "일");
  assert.equal(koInteger(10), "십");
  assert.equal(koInteger(11), "십일");
  assert.equal(koInteger(100), "백");
  assert.equal(koInteger(1200), "천이백");
  assert.equal(koInteger(10000), "만");
  assert.equal(koInteger(12000), "만 이천");
  assert.equal(koInteger(188700), "십팔만 팔천칠백");
  assert.equal(koInteger(612000), "육십일만 이천");
  assert.equal(koInteger(100000000), "일억");
  assert.equal(koInteger(100010000), "일억 만");
  assert.equal(koInteger(1000000000000), "일조");
  assert.equal(koInteger(107440000000000), "백칠조 사천사백억");
});

test("소수·퍼센트·금액", () => {
  assert.equal(koDecimal(6.36), "육 점 사");
  assert.equal(koDecimal(6.3), "육 점 삼");
  assert.equal(koDecimal(2), "이");
  assert.equal(koDecimal(-0.5), "마이너스 영 점 오");
  assert.equal(spokenPct(-6.36), "육 점 사 퍼센트");
  assert.equal(spokenPct(0.31), "영 점 삼 퍼센트");
  assert.equal(spokenKrw(188700), "십팔만 팔천칠백 원");
  assert.equal(spokenEok(1074400, "억원"), "백칠조 사천사백억 원");
  assert.equal(spokenEok(320, "억원"), "삼백이십억 원");
});
