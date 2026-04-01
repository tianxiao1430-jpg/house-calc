export type Mode = 'buy' | 'rent';

export interface ExtractedProperty {
  price?: number;
  rent?: number;
  management_fee: number;
  repair_reserve: number;
  common_fee: number;
  area?: number;
  building_age?: number;
  location?: string;
  structure?: string;
  deposit_months?: number;
  key_money_months?: number;
  confidence?: number;
}

export interface BuyInputs {
  down_payment: number;
  loan_term_years: number;
  interest_rate: number;
  purpose: 'residence' | 'investment';
  is_new_construction: boolean;
}

export interface RentInputs {
  needs_guarantor: boolean;
}

export interface CostLineItem {
  label: string;
  amount: number;
}

export interface CostResult {
  mode: Mode;
  monthly_items: CostLineItem[];
  monthly_total: number;
  initial_items: CostLineItem[];
  initial_total: number;
  long_term: { label: string; amount: number }[];
}

export interface HistoryEntry {
  id: string;
  mode: Mode;
  location: string;
  monthly_total: number;
  initial_total: number;
  result: CostResult;
  property: ExtractedProperty;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
