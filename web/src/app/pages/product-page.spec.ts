import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ApiService } from '../core/api.service';
import type { ProductDetail } from '../core/api.types';
import { ProductPage } from './product-page';

const detail: ProductDetail = {
  id: 'mail-activity',
  name: 'Mail Activity',
  purpose: 'Searchable Gmail message data.',
  status: 'active',
  tables: ['lake_gold.mail_activity'],
  trustScore: 82,
  usageCount: 12,
  contract: { id: 'mail-activity' },
  limitations: 'Bodies capped at 32 KB per message.',
  concepts: ['home.mail.message'],
};

/** Await the async effect fetch chains and render the result. */
async function flush(fixture: { whenStable(): Promise<void>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function setup(product: ProductDetail = detail) {
  const api = {
    product: vi.fn().mockResolvedValue(product),
  };
  TestBed.configureTestingModule({
    imports: [ProductPage],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ApiService, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(ProductPage);
  fixture.componentRef.setInput('id', 'mail-activity');
  return { fixture, api };
}

describe('ProductPage', () => {
  it('renders purpose, limitations and concepts for the product', async () => {
    const { fixture, api } = setup();
    fixture.detectChanges();
    await flush(fixture);

    expect(api.product).toHaveBeenCalledWith('mail-activity');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Mail Activity');
    expect(text).toContain('Bodies capped at 32 KB per message.');
    expect(text).toContain('home.mail.message');
  });

  it('shows the error state when the product is unknown', async () => {
    const api = {
      product: vi.fn().mockRejectedValue(new Error('404 Not Found: /products/nope')),
    };
    TestBed.configureTestingModule({
      imports: [ProductPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(ProductPage);
    fixture.componentRef.setInput('id', 'nope');
    fixture.detectChanges();
    await flush(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('404 Not Found');
  });
});
