import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const base = { nonce: "abc123", isDev: false, supabaseUrl: "https://xkdnztgfleimmjhpbvvn.supabase.co", turnstile: false };

describe("buildCsp", () => {
  const csp = buildCsp(base);

  it("only runs scripts that carry this request's nonce, and never eval in production", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("lets the browser talk to Supabase (including realtime) and the scanner's decoder, and nobody else", () => {
    expect(csp).toContain("connect-src 'self' https://xkdnztgfleimmjhpbvvn.supabase.co wss://xkdnztgfleimmjhpbvvn.supabase.co https://fastly.jsdelivr.net");
    expect(csp).not.toContain("*");
  });

  it("blocks framing, plugins and base-tag tricks", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-src 'none'");
  });

  it("forces https in production only", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, isDev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval and localhost sockets only in development", () => {
    const dev = buildCsp({ ...base, isDev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
  });

  it("allows the Turnstile frame only when it is switched on", () => {
    expect(buildCsp({ ...base, turnstile: true })).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("copes with a missing or odd Supabase address", () => {
    expect(buildCsp({ ...base, supabaseUrl: undefined })).toContain("connect-src 'self' https://fastly.jsdelivr.net");
    expect(buildCsp({ ...base, supabaseUrl: "not a url" })).toContain("connect-src 'self' https://fastly.jsdelivr.net");
  });
});
