jest.mock("../../../../defi/src/utils/discord", () => ({
  sendMessage: jest.fn(() => Promise.resolve()),
}));

import { addToDBWritesList, __resetNumericWarningsForTests } from "./database";
import { sendMessage } from "../../../../defi/src/utils/discord";
import type { Write } from "./dbInterfaces";

const mockSendMessage = sendMessage as jest.Mock;

beforeEach(() => {
  mockSendMessage.mockClear();
  __resetNumericWarningsForTests();
  process.env.STALE_COINS_ADAPTERS_WEBHOOK = "https://discord.test/webhook";
});

afterAll(() => {
  delete process.env.STALE_COINS_ADAPTERS_WEBHOOK;
});

const TS = 1700000000;

describe("addToDBWritesList numeric guardrail", () => {
  test("valid number inputs: write goes through with exact types, no warning", () => {
    const writes: Write[] = [];
    addToDBWritesList(writes, "ethereum", "0xAAA", 1.23, 18, "AAA", TS, "ok-adapter", 0.99);
    expect(writes).toHaveLength(1);
    expect(typeof writes[0].price).toBe("number");
    expect(writes[0].price).toBe(1.23);
    expect(writes[0].confidence).toBe(0.99);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test("string price: coerced to number and written (does not throw)", () => {
    const writes: Write[] = [];
    addToDBWritesList(
      writes,
      "ethereum",
      "0xBBB",
      "42.5" as any,
      18,
      "BBB",
      TS,
      "str-price-adapter",
      0.99,
    );
    expect(writes).toHaveLength(1);
    expect(typeof writes[0].price).toBe("number");
    expect(writes[0].price).toBe(42.5);
    // String-but-numeric isn't a "non-finite" case, so no warn is expected.
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test("unparseable price: write proceeds with NaN, Discord warn fires once", () => {
    const writes: Write[] = [];
    addToDBWritesList(
      writes,
      "ethereum",
      "0xCCC",
      "not-a-number" as any,
      18,
      "CCC",
      TS,
      "bad-price-adapter",
      0.99,
    );
    // Write happened (no throw) — preserves pre-PR behaviour.
    expect(writes).toHaveLength(1);
    expect(Number.isNaN(writes[0].price)).toBe(true);
    // Warn fired to Discord.
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][0]).toMatch(/bad-price-adapter/);
    expect(mockSendMessage.mock.calls[0][0]).toMatch(/price/);
  });

  test("NaN decimals: write proceeds, warn fires", () => {
    const writes: Write[] = [];
    addToDBWritesList(
      writes,
      "ethereum",
      "0xDDD",
      1.0,
      NaN,
      "DDD",
      TS,
      "nan-decimals-adapter",
      0.99,
    );
    expect(writes).toHaveLength(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][0]).toMatch(/decimals/);
  });

  test("undefined confidence: write proceeds with NaN confidence, warn fires", () => {
    const writes: Write[] = [];
    addToDBWritesList(
      writes,
      "ethereum",
      "0xEEE",
      1.0,
      18,
      "EEE",
      TS,
      "undef-conf-adapter",
      undefined as any,
    );
    expect(writes).toHaveLength(1);
    expect(Number.isNaN(writes[0].confidence)).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][0]).toMatch(/confidence/);
  });

  test("dedup: same adapter+field+reason emits on threshold boundaries (1, 10, ...)", () => {
    const writes: Write[] = [];
    // 5 calls — only the first crosses a threshold, so exactly one Discord msg.
    for (let i = 0; i < 5; i++) {
      addToDBWritesList(
        writes,
        "ethereum",
        `0xF${i}`,
        "garbage" as any,
        18,
        "X",
        TS,
        "dedup-adapter",
        0.99,
      );
    }
    expect(writes).toHaveLength(5);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // 5 more calls bring the count to 10 — second threshold, second Discord msg.
    for (let i = 5; i < 10; i++) {
      addToDBWritesList(
        writes,
        "ethereum",
        `0xF${i}`,
        "garbage" as any,
        18,
        "X",
        TS,
        "dedup-adapter",
        0.99,
      );
    }
    expect(writes).toHaveLength(10);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage.mock.calls[1][0]).toMatch(/seen 10 time/);
  });

  test("webhook unset: console.error still fires but no Discord call", () => {
    delete process.env.STALE_COINS_ADAPTERS_WEBHOOK;
    const writes: Write[] = [];
    addToDBWritesList(
      writes,
      "ethereum",
      "0xF99",
      1.0,
      18,
      "X",
      TS,
      "no-webhook-adapter",
      undefined as any,
    );
    expect(writes).toHaveLength(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
