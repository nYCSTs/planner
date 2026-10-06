// Generates a VAPID key pair for Web Push.
// Usage: node scripts/vapid.mjs  → prints the JWK to store as the VAPID_JWK secret.
const { privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
const { kty, crv, x, y, d } = jwk;
console.log(JSON.stringify({ kty, crv, x, y, d }));
