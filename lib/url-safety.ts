import { isIP } from "node:net";

function blockedIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

function blockedIpv6(hostname: string) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("::ffff:127.");
}

export function validatePublicHttpUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("only http/https URLs are allowed");
  if (url.username || url.password) throw new TypeError("URL credentials are not allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new TypeError("local network URLs are not allowed");
  }
  const ipHostname = hostname.replace(/^\[|\]$/g, "");
  const version = isIP(ipHostname);
  if ((version === 4 && blockedIpv4(ipHostname)) || (version === 6 && blockedIpv6(ipHostname))) {
    throw new TypeError("private network URLs are not allowed");
  }
  url.hash = "";
  return url.toString();
}
