// Validators
// TODO: Implement validation logic

import { z } from 'zod';

export const OrganizationNameSchema = z.string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Organization name must be lowercase alphanumeric with hyphens');

export const FingerprintSchema = z.string()
  .regex(/^bloom:org:[a-z0-9-]+$/, 'Invalid organization fingerprint format');

export function validateOrganizationName(name: string): boolean {
  try {
    OrganizationNameSchema.parse(name);
    return true;
  } catch {
    return false;
  }
}

export function validateFingerprint(fingerprint: string): boolean {
  try {
    FingerprintSchema.parse(fingerprint);
    return true;
  } catch {
    return false;
  }
}
