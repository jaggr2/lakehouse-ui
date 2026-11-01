import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ApiService } from '../core/api.service';
import type { ImpactReport, QualityReport, TableDetail, UsageReport } from '../core/api.types';
import { TablePage } from './table-page';

const table: TableDetail = {
  id: 'lake_gold.mail_activity',
  database: 'lake_gold',
  columns: [
    { name: 'message_id', type: 'string', description: 'Gmail message id', concept: 'home.mail.message_id', quality: ['uniqueness'] },
    { name: 'subject', type: 'string', description: 'Message subject', concept: null, quality: [] },
  ],
  contract: { id: 'mail-activity' },
  trustScore: 82,
  certification: {
    assetId: 'lake_gold.mail_activity',
    certified: false,
    note: null,
    author: null,
    ts: null,
    history: [],
  },
};

const quality: QualityReport = {
  tableId: 'lake_gold.mail_activity',
  trustScore: 82,
  trust: {
    score: 82,
    status: 'trusted',
    components: [
      { name: 'contract', score: 100, weight: 25, known: true, evidence: 'ODCS contract present' },
    ],
  },
  freshness: { status: 'fresh' },
  rules: [
    { name: 'uniqueness(message_id)', status: 'pass', source: 'odcs', column: 'message_id', description: 'message ids are unique', severity: null, dimension: 'uniqueness' },
  ],
  testHistory: [],
};

const usage: UsageReport = {
  tableId: 'lake_gold.mail_activity',
  windowDays: 30,
  totalQueries: 3,
  daily: [{ date: '2026-10-24', count: 2 }],
  topConsumers: [{ actor: 'workbench', queries: 3 }],
};

const impact: ImpactReport = {
  asset: 'lake_gold.mail_activity',
  downstream: {
    models: ['model.mail_activity'],
    contracts: ['mail-activity'],
    products: ['mail-activity'],
    queries: [],
    terms: [],
    domains: [],
  },
  notes: [],
};

/** Await the async effect fetch chains and render the result. */
async function flush(fixture: { whenStable(): Promise<void>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function setup(overrides: Partial<Record<'table' | 'quality' | 'usage' | 'impact', unknown>> = {}) {
  const api = {
    table: vi.fn().mockResolvedValue(overrides.table ?? table),
    quality: vi.fn().mockResolvedValue(overrides.quality ?? quality),
    usage: vi.fn().mockResolvedValue(overrides.usage ?? usage),
    impact: vi.fn().mockResolvedValue(overrides.impact ?? impact),
    certify: vi.fn().mockImplementation(async (_assetId: string, certified: boolean) => ({
      ...table.certification,
      certified,
      author: 'ui',
      ts: '2026-11-01T00:00:00.000Z',
    })),
  };
  TestBed.configureTestingModule({
    imports: [TablePage],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(TablePage);
  fixture.componentRef.setInput('id', 'lake_gold.mail_activity');
  return { fixture, api };
}

describe('TablePage', () => {
  it('renders columns, trust components and quality rules', async () => {
    const { fixture } = setup();
    fixture.detectChanges();
    await flush(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('lake_gold.mail_activity');
    expect(text).toContain('message_id');
    expect(text).toContain('Gmail message id');
    expect(text).toContain('uniqueness(message_id)');
    expect(text).toContain('ODCS contract present');
  });

  it('certifies the table from the header', async () => {
    const { fixture, api } = setup();
    fixture.detectChanges();
    await flush(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const certify = Array.from(root.querySelectorAll<HTMLButtonElement>('button.ghost')).find((b) =>
      b.textContent?.includes('certify'),
    );
    certify?.click();
    await flush(fixture);

    expect(api.certify).toHaveBeenCalledWith('lake_gold.mail_activity', true);
    expect(root.textContent).toContain('certified by ui');
  });

  it('runs the impact analysis on demand', async () => {
    const { fixture, api } = setup();
    fixture.detectChanges();
    await flush(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button.ghost')).find((b) =>
      b.textContent?.includes('analyze'),
    );
    expect(button).toBeDefined();
    button?.click();
    await flush(fixture);

    expect(api.impact).toHaveBeenCalledWith('lake_gold.mail_activity');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('If lake_gold.mail_activity changes,');
    expect(text).toContain('objects are affected:');
    expect(text).toContain('model.mail_activity');
  });
});
