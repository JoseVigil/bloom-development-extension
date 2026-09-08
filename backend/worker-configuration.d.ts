interface Env {
  DB: D1Database;
  RELEASES: R2Bucket;
  MANDATES: R2Bucket;
  AUTHORITY_SIGNING_KEY_PKCS8_B64: string;
  AUTHORITY_SIGNING_KEY_ID: string;
}
