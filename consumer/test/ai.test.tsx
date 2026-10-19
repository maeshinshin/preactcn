import { describe, expect, it } from "vitest";
import { createChat, getMessageText } from "@/lib/ai";

describe("scripted chat stand-in", () => {
  it("replays the script turn by turn", async () => {
    const chat = createChat().user("hi").sleep(1).assistant("hello").user("bye");
    const transport = chat.transport();

    expect(chat.get(0)).toEqual([]);
    expect(chat.get()).toHaveLength(3);
    const first = chat.next([])!;
    expect(getMessageText(first)).toBe("hi");

    const reply = await transport([first]);
    expect(reply && getMessageText(reply)).toBe("hello");
    expect(getMessageText(chat.next([first, reply!])!)).toBe("bye");
    expect(chat.next(chat.get())).toBeNull();
    expect(await transport(chat.get())).toBeNull();
  });
});
