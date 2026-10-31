import { Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { ProductDetail } from '../core/api.types';

@Component({
  selector: 'app-product-page',
  imports: [RouterLink, DecimalPipe, DatePipe],
  template: `
    @if (p(); as product) {
      <h2>{{ product.name }}</h2>
      <p class="page-sub">{{ product.purpose }}</p>

      <div class="grid cols3">
        <div class="card">
          <h4>Trust &amp; usage</h4>
          <div class="row">
            <div class="meter">
              <span [style.width.%]="product.trustScore" [style.background]="trustColor(product.trustScore)"></span>
            </div>
            <span class="badge-num">{{ product.trustScore | number: '1.0-0' }}</span>
          </div>
          <p class="small muted" style="margin-top:10px">
            {{ product.usageCount }} queries in the lookback window · status {{ product.status }}
          </p>
        </div>
        <div class="card">
          <h4>Certification</h4>
          @if (product.certification.certified) {
            <span class="chip good">certified</span>
            <p class="small muted" style="margin-top:10px">
              {{ product.certification.note || 'stewarded' }} — {{ product.certification.author }}
              @if (product.certification.ts) { · {{ product.certification.ts | date: 'medium' }} }
            </p>
            <button class="ghost" (click)="setCertification(false)">revoke</button>
          } @else {
            <span class="chip gray">uncertified</span>
            <p class="small muted" style="margin-top:10px">
              Nobody stands behind this product yet — trust score and contracts
              are evidence, not an assertion.
            </p>
            <button class="ghost" (click)="setCertification(true)">certify</button>
          }
        </div>
        <div class="card">
          <h4>Limitations</h4>
          <p class="small">{{ product.limitations || '—' }}</p>
        </div>
        <div class="card">
          <h4>Concepts used</h4>
          <div class="row">
            @for (c of product.concepts; track c) {
              <a class="chip" [routerLink]="['/concepts']">{{ c }}</a>
            } @empty { <span class="muted small">none mapped</span> }
          </div>
        </div>
      </div>

      <h3>Tables</h3>
      <table class="data">
        <thead><tr><th>Table</th><th>Actions</th></tr></thead>
        <tbody>
          @for (t of product.tables; track t) {
            <tr>
              <td class="mono">{{ t }}</td>
              <td>
                <a [routerLink]="['/table', t]">columns &amp; quality</a> ·
                <a [routerLink]="['/lineage']" [queryParams]="{ table: t }">lineage</a>
              </td>
            </tr>
          }
        </tbody>
      </table>

      <h3>Contract (ODCS)</h3>
      <details>
        <summary class="small muted">show contract</summary>
        <pre>{{ contractJson }}</pre>
      </details>
    } @else {
      <p class="muted">{{ error() ?? 'Loading…' }}</p>
    }
  `,
})
export class ProductPage {
  private readonly api = inject(ApiService);
  readonly id = input.required<string>();
  readonly p = signal<ProductDetail | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      this.error.set(null);
      void this.api
        .product(id)
        .then((p) => this.p.set(p))
        .catch((e: Error) => this.error.set(e.message));
    });
  }

  get contractJson(): string {
    return JSON.stringify(this.p()?.contract ?? {}, null, 2);
  }

  setCertification(certified: boolean): void {
    const product = this.p();
    if (!product) return;
    void this.api
      .certify(product.id, certified)
      .then((certification) => this.p.set({ ...product, certification }));
  }

  trustColor(score: number): string {
    return score >= 80 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
  }
}
