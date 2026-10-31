import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ApiService } from '../core/api.service';
import type { Product, SearchHit } from '../core/api.types';
import { CatalogPage } from './catalog-page';

const product: Product = {
  id: 'mail-activity',
  name: 'Mail Activity',
  purpose: 'Searchable Gmail message data.',
  status: 'active',
  tables: ['lake_gold.mail_activity'],
  trustScore: 82,
  usageCount: 12,
  certification: {
    assetId: 'mail-activity',
    certified: true,
    note: 'stewarded end to end',
    author: 'roger',
    ts: '2026-10-25T08:00:00.000Z',
    history: [],
  },
};

/** Await the async effect fetch chains and render the result. */
async function flush(fixture: { whenStable(): Promise<void>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function setup(products: Product[] = [product], hits: SearchHit[] = []) {
  const api = {
    products: vi.fn().mockResolvedValue(products),
    search: vi.fn().mockResolvedValue(hits),
  };
  TestBed.configureTestingModule({
    imports: [CatalogPage],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ApiService, useValue: api },
    ],
  });
  return { fixture: TestBed.createComponent(CatalogPage), api };
}

describe('CatalogPage', () => {
  it('lists data products with trust + usage rollups', async () => {
    const { fixture } = setup();
    fixture.detectChanges();
    await flush(fixture);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mail Activity');
    expect(text).toContain('Searchable Gmail message data.');
    expect(text).toContain('12 queries');
    expect(text).toContain('certified');
  });

  it('shows ranked search hits for a query', async () => {
    const { fixture, api } = setup([product], [
      { kind: 'table', id: 'lake_gold.mail_activity', label: 'mail_activity', context: 'mail-activity' },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.onSearch('mail');
    await flush(fixture);

    expect(api.search).toHaveBeenCalledWith('mail');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Search results for');
    expect(text).toContain('mail_activity');
  });
});
