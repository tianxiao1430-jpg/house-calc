/**
 * Simple in-memory session store for passing data between screens.
 * Avoids URL param size limits and encoding issues.
 */

import type { ExtractedProperty, Mode, CostResult } from '../types';

interface SessionData {
  mode: Mode;
  imageUri?: string;
  extracted?: ExtractedProperty;
  property?: Record<string, any>;
  costResult?: CostResult;
}

let _session: SessionData = { mode: 'rent' };

export function setSession(data: Partial<SessionData>) {
  _session = { ..._session, ...data };
}

export function getSession(): SessionData {
  return _session;
}

export function clearSession() {
  _session = { mode: 'rent' };
}
