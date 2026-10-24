import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import canonicalize from 'canonicalize';
import { Fault } from './fault.ts';

export const hash = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text)));

export function canonical(value: object): string;
export function canonical(value: unknown): string | undefined;

export function canonical(value: unknown): string | undefined {
  try {
    return canonicalize(value);
  } catch {
    throw new Fault('invalid_entity');
  }
}
