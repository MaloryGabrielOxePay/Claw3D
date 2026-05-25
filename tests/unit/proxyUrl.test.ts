// tests/unit/proxyUrl.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStudioProxyGatewayUrl } from "@/lib/gateway/proxy-url";

const setLocation = (href: string) => {
  const parsed = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      ...window.location,
      href: parsed.href,
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port,
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
  });
};

describe("resolveStudioProxyGatewayUrl", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  describe("browser on loopback origin (dev local)", () => {
    beforeEach(() => setLocation("http://localhost:3000/"));

    it("returns the raw loopback URL when configured URL is also loopback", () => {
      expect(resolveStudioProxyGatewayUrl("ws://localhost:18789")).toBe(
        "ws://localhost:18789",
      );
    });

    it("returns proxy path when configured URL is non-loopback", () => {
      expect(resolveStudioProxyGatewayUrl("wss://example.com:18789")).toBe(
        "ws://localhost:3000/api/gateway/ws",
      );
    });
  });

  describe("browser on remote origin (deployed)", () => {
    beforeEach(() => setLocation("https://hub.grupomalory.com/"));

    it("returns proxy path even when configured URL is loopback (the fix)", () => {
      expect(resolveStudioProxyGatewayUrl("ws://localhost:18789")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is non-loopback", () => {
      expect(resolveStudioProxyGatewayUrl("wss://example.com:18789")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is empty", () => {
      expect(resolveStudioProxyGatewayUrl("")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });

    it("returns proxy path when configured URL is malformed", () => {
      expect(resolveStudioProxyGatewayUrl("not-a-url")).toBe(
        "wss://hub.grupomalory.com/api/gateway/ws",
      );
    });
  });
});
