/**
 * API client for House Calc backend.
 * All LLM calls go through the backend — no API keys in the client.
 */

import type { ExtractedProperty, CostResult, BuyInputs, RentInputs, ChatMessage } from '../types';

// TODO: change to production URL
// Unit convention: Frontend displays in 万円, API sends in 円
export const API_TOKEN = "house-calc-2024-secret";

export const BASE_URL = __DEV__ ? 'http://localhost:8000' : 'https://house-calc-api-7526431800.asia-northeast1.run.app';

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export async function extractProperty(
  imageUri: string,
  mode: 'buy' | 'rent',
): Promise<ExtractedProperty> {
  const formData = new FormData();

  // Convert URI to blob for upload
  const response = await fetch(imageUri);
  const blob = await response.blob();
  formData.append('image', blob, 'screenshot.jpg');
  formData.append('mode', mode);

  const res = await fetch(`${BASE_URL}/extract`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Extract failed: ${body}`);
  }
  return res.json();
}

export async function chat(
  mode: 'buy' | 'rent',
  extracted: ExtractedProperty,
  conversation: ChatMessage[],
  userMessage: string,
): Promise<{ reply: string; conversation: ChatMessage[] }> {
  return request('/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: JSON.stringify({
      mode,
      extracted,
      conversation,
      user_message: userMessage,
    }),
  });
}

/** Convert price from 万円 to 円 for API submission */
function toYen(man: number): number {
  return man * 10000;
}

export function preparePropertyForApi(prop: Record<string, any>): Record<string, any> {
  const result = { ...prop };
  // Ensure price is in 円 (backend expects 円)
  if (result.price && result.price < 100000) {
    result.price = toYen(result.price);
  }
  return result;
}

export async function calculateBuy(
  property: ExtractedProperty,
  inputs: BuyInputs,
): Promise<CostResult> {
  return request('/calculate/buy', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ property, ...inputs }),
  });
}

export async function calculateRent(
  property: ExtractedProperty,
  inputs: RentInputs,
): Promise<CostResult> {
  return request('/calculate/rent', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
    body: JSON.stringify({ property, ...inputs }),
  });
}
