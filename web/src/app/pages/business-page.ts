import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { BusinessDomain, BusinessReport, BusinessTerm } from '../core/api.types';

/**
 * The business layer (B2): domains as Datasport-style module cards, terms
 * drilling through to the concepts they map to — business term -> concept ->
 * column. Data comes from /api/business (graph.json domain/business_term
 * nodes compiled from lakehouse/business/ by build_graph.py).
 */
@Component({
  selector: 'app-business-page',
  imports: [RouterLink],
  template: `
    <h2>Business</h2>
    <p class="page-sub">
      The business layer: domains, their vocabulary, and how every term maps
      onto the semantic concepts (business term &rarr; concept &rarr; column).
      Click a term to see what it means and what it maps to.
    </p>

    @if (report(); as r) {
      <div class="grid cols2">
        @for (d of r.domains; track d.id) {
          <div class="card">
            <h4>{{ d.name }}</h4>
            <p class="small muted">{{ d.description }}</p>
            <div class="row" style="margin-top:10px">
              @for (p of d.products; track p) {
                <a class="chip" [routerLink]="['/product', p]">{{ p }}</a>
              }
              <span class="chip gray">{{ d.terms.length }} terms</span>
            </div>
            <div class="row" style="margin-top:10px">
              @for (t of termsOf(r, d); track t.id) {
                <button class="ghost" [style.border-color]="selected()?.id === t.id ? 'var(--accent)' : ''"
                        (click)="selected.set(t)">{{ t.name }}</button>
              }
            </div>
          </div>
        }
      </div>

      @if (selected(); as t) {
        <div class="card" style="margin-top:14px">
          <div class="row">
            <h4 style="margin:0">{{ t.name }}</h4>
            <span class="chip" [class]="typeChip(t.type)">{{ t.type }}</span>
            <span class="muted small">{{ domainName(r, t.domain) }}</span>
          </div>
          <p class="small" style="margin-top:8px">{{ t.definition }}</p>
          @if (t.synonyms.length) {
            <div class="row" style="margin-top:8px">
              <span class="muted small" style="min-width:110px">synonyms</span>
              @for (s of t.synonyms; track s) { <span class="chip gray">{{ s }}</span> }
            </div>
          }
          <div class="row" style="margin-top:8px">
            <span class="muted small" style="min-width:110px">maps to concepts</span>
            @for (c of t.concepts; track c) {
              <a class="chip" [routerLink]="['/concepts']">{{ c }}</a>
            } @empty { <span class="chip warn">unmapped</span> }
          </div>
          <p class="small muted" style="margin-top:10px">
            These concepts resolve further to columns and tables &mdash; see the
            <a [routerLink]="['/concepts']">concept registry</a> or ask the
            <a [routerLink]="['/workbench']">workbench</a> in these words.
          </p>
        </div>
      }
    } @else {
      <p class="muted">{{ error() ?? 'Loading…' }}</p>
    }
  `,
})
export class BusinessPage {
  private readonly api = inject(ApiService);
  readonly report = signal<BusinessReport | null>(null);
  readonly error = signal<string | null>(null);
  readonly selected = signal<BusinessTerm | null>(null);

  constructor() {
    void this.api
      .business()
      .then((r) => this.report.set(r))
      .catch((e: Error) => this.error.set(e.message));
  }

  termsOf(r: BusinessReport, d: BusinessDomain): BusinessTerm[] {
    const byId = new Map(r.terms.map((t) => [t.id, t]));
    return d.terms.map((id) => byId.get(id)).filter((t): t is BusinessTerm => !!t);
  }

  domainName(r: BusinessReport, domainId: string): string {
    return r.domains.find((d) => d.id === domainId)?.name ?? domainId;
  }

  typeChip(type: string): string {
    switch (type) {
      case 'measure': return 'chip good';
      case 'event': return 'chip warn';
      case 'dimension': return 'chip gray';
      default: return 'chip';
    }
  }
}
