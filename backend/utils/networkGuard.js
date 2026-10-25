// utils/networkGuard.js
// Blocks SMTP connections pointed at private or internal IP addresses.
// Called before saving a new SMTP connection and before opening one to send.

import dns from "node:dns/promises";
import net from "node:net";

// Each entry is [baseAddress, mask] as unsigned 32-bit integers.
// An IP matches if (ip & mask) === base.
const BLOCKED = [
  [0x7f000000, 0xff000000], // 127.0.0.0/8    loopback
  [0x0a000000, 0xff000000], // 10.0.0.0/8     RFC1918
  [0xac100000, 0xfff00000], // 172.16.0.0/12  RFC1918
  [0xc0a80000, 0xffff0000], // 192.168.0.0/16 RFC1918
  [0xa9fe0000, 0xffff0000], // 169.254.0.0/16 link-local
  [0xe0000000, 0xf0000000], // 224.0.0.0/4    multicast
  [0x00000000, 0xff000000], // 0.0.0.0/8      "this" network
];

function ipToUint32(ip) {
  // Converts "1.2.3.4" → a 32-bit unsigned integer.
  return ip.split(".").reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

function isBlockedIpv4(ip) {
  const n = ipToUint32(ip);
  return BLOCKED.some(([base, mask]) => (n & mask) === base);
}

// Throws if the hostname resolves to any private or unroutable address.
// The error has code "INVALID_SMTP_HOST" and permanent: true so the worker
// does not retry.
export async function assertPublicHost(host) {
  const h = String(host || "").trim().toLowerCase();

  // Reject bare private IPs immediately — no DNS lookup needed.
  if (net.isIPv4(h)) {
    if (isBlockedIpv4(h)) {
      const err = new Error(`SMTP host "${h}" is a private address.`);
      err.code = "INVALID_SMTP_HOST";
      err.permanent = true;
      throw err;
    }
    return; // bare public IPv4 is fine
  }

  // Resolve the hostname and check every returned address.
  let addresses;
  try {
    addresses = await dns.resolve4(h);
  } catch {
    const err = new Error(`SMTP host "${h}" could not be resolved.`);
    err.code = "INVALID_SMTP_HOST";
    err.permanent = true;
    throw err;
  }

  for (const addr of addresses) {
    if (isBlockedIpv4(addr)) {
      const err = new Error(`SMTP host "${h}" resolves to a private address.`);
      err.code = "INVALID_SMTP_HOST";
      err.permanent = true;
      throw err;
    }
  }
}