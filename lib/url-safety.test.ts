import { describe, expect, it } from "vitest";
import { validatePublicHttpUrl } from "./url-safety";

describe("validatePublicHttpUrl", () => {
  it("accepts public HTTP URLs and removes fragments", () => {
    expect(validatePublicHttpUrl("https://openai.com/news/#latest")).toBe("https://openai.com/news/");
  });

  it.each([
    "file:///etc/passwd",
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://10.0.0.8/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://user:password@example.com/"
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validatePublicHttpUrl(url)).toThrow();
  });
});
