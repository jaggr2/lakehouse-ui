import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { Product, SearchHit } from '../core/api.types';

@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, DecimalPipe],
  template: `
    <h2>Data products</h2>
    <p class="page-sub">
      Governed gold-layer products. Contracts define columns and quality; the
      semantic layer defines meaning.
    </p>

    <input
      type="text"
      placeholder="Search products, tables, columns, concepts…"
      [value]="q()"
      (input)="onSearch(($any($event.target).value))"
    />

    @if (q(); as term) {
      <h3>Search results for “{{ term }}”</h3>
      @if (hits() === null) {
        <p class="muted">Searching…</p>
      } @else {
        <table class="data">
          <thead>
            <tr><th>Kind</th><th>Label</th><th>Context</th></tr>
          </thead>
          <tbody>
            @for (h of hits(); track h.id) {
              <tr>
                <td><span class="chip gray">{{ h.kind }}</span></td>
                <td><a [routerLink]="linkFor(h)">{{ h.label }}</a></td>
                <td class="muted small">{{ h.context }}</td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="muted">No hits.</td></tr>
            }
          </tbody>
        </table>
      }
    } @else {
      <h3>Products ({{ products().length }})</h3>
      <div class="grid cols3">
        @for (p of products(); track p.id) {
          <div class="card">
            <h4><a [routerLink]="['/product', p.id]">{{ p.name }}</a></h4>
            <div class="purpose">{{ p.purpose }}</div>
            <div class="row">
              <span class="badge-num" title="trust score">{{ p.trustScore | number: '1.0-0' }}</span>
              <div class="meter">
                <span [style.width.%]="p.trustScore" [style.background]="trustColor(p.trustScore)"></span>
              </div>
              <span class="chip gray">{{ p.usageCount }} queries</span>
            </div>
            <div class="row" style="margin-top:8px">
              @for (t of p.tables; track t) {
                <a class="chip" [routerLink]="['/table', t]">{{ t }}</a>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class CatalogPage {
  private readonly api = inject(ApiService);
  readonly products = signal<Product[]>([]);
  readonly q = signal('');
  readonly hits = signal<SearchHit[] | null>(null);

  constructor() {
    void this.api.products().then((p) => this.products.set(p));
  }

  onSearch(term: string): void {
    this.q.set(term);
    if (!term.trim()) {
      this.hits.set(null);
      return;
    }
    this.hits.set(null);
    void this.api.search(term).then((h) => this.hits.set(h));
  }

  linkFor(h: SearchHit): string[] {
    if (h.kind === 'product') return ['/product', h.id];
    if (h.kind === 'concept') return ['/concepts'];
    return ['/table', h.id];
  }

  trustColor(score: number): string {
    return score >= 80 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
  }
}
