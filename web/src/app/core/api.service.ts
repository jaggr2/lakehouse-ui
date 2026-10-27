import { Injectable } from '@angular/core';
import type {
  BusinessReport, Concept, EvalReport, EvalRun, FeedbackRecord, Graph, ImpactReport, Product, ProductDetail,
  QualityReport, QueryResponse, SearchHit, TableDetail, UsageReport, WeakSignalRecord,
} from './api.types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);
  return (await res.json()) as T;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  search(q: string): Promise<SearchHit[]> {
    return get<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`).then((r) => r.hits);
  }
  products(): Promise<Product[]> {
    return get<{ products: Product[] }>('/products').then((r) => r.products);
  }
  product(id: string): Promise<ProductDetail> {
    return get<ProductDetail>(`/products/${encodeURIComponent(id)}`);
  }
  table(id: string): Promise<TableDetail> {
    return get<TableDetail>(`/tables/${encodeURIComponent(id)}`);
  }
  lineage(table: string, depth = 2): Promise<Graph> {
    return get<Graph>(`/lineage?table=${encodeURIComponent(table)}&depth=${depth}`);
  }
  impact(table: string, column?: string): Promise<ImpactReport> {
    const col = column ? `&column=${encodeURIComponent(column)}` : '';
    return get<ImpactReport>(`/impact?table=${encodeURIComponent(table)}${col}`);
  }
  quality(tableId: string): Promise<QualityReport> {
    return get<QualityReport>(`/quality/${encodeURIComponent(tableId)}`);
  }
  usage(tableId: string, days = 30): Promise<UsageReport> {
    return get<UsageReport>(`/usage/${encodeURIComponent(tableId)}?days=${days}`);
  }
  concepts(): Promise<Concept[]> {
    return get<{ concepts: Concept[] }>('/concepts').then((r) => r.concepts);
  }
  business(): Promise<BusinessReport> {
    return get<BusinessReport>('/business');
  }
  weakSignals(status?: string): Promise<WeakSignalRecord[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return get<{ signals: WeakSignalRecord[] }>(`/weak-signals${q}`).then((r) => r.signals);
  }
  async submitWeakSignal(input: {
    kind: 'rephrase' | 'sql_edit';
    prompt: string;
    prevPrompt?: string;
    sql?: string;
  }): Promise<WeakSignalRecord> {
    const res = await fetch(`${BASE}/weak-signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: /weak-signals`);
    return (await res.json()) as WeakSignalRecord;
  }
  async promoteWeakSignal(id: number): Promise<void> {
    const res = await fetch(`${BASE}/weak-signals/${id}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: promote weak signal`);
  }
  evals(): Promise<EvalReport> {
    return get<EvalReport>('/evals');
  }
  evalHistory(): Promise<EvalRun[]> {
    return get<{ runs: EvalRun[] }>('/evals/history').then((r) => r.runs);
  }
  listFeedback(status?: string): Promise<FeedbackRecord[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return get<{ feedback: FeedbackRecord[] }>(`/feedback${q}`).then((r) => r.feedback);
  }
  async submitFeedback(input: {
    prompt: string;
    generatedSql: string;
    correctedSql?: string;
    notes?: string;
  }): Promise<FeedbackRecord> {
    const res = await fetch(`${BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: /feedback`);
    return (await res.json()) as FeedbackRecord;
  }
  async promoteFeedback(id: number, correctedSql?: string): Promise<void> {
    const res = await fetch(`${BASE}/feedback/${id}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correctedSql ? { correctedSql } : {}),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: promote`);
  }
  async query(body: { prompt?: string; sql?: string }): Promise<QueryResponse> {
    const res = await fetch(`${BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: /query`);
    return (await res.json()) as QueryResponse;
  }
}
