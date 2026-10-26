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
      <div class="card arch-frame" style="margin-bottom:14px">
        <svg class="arch" viewBox="0 0 1200 620" role="img" aria-labelledby="business-map-title business-map-desc">
          <title id="business-map-title">Business domain map</title>
          <desc id="business-map-desc">
            The six business domains as tiles, each listing its terms with the
            type of thing they describe and how many semantic concepts they map
            to. Click a term to open it below.
          </desc>
          <rect width="1200" height="620" fill="var(--bg)" />
          @for (tile of mapTiles(r); track tile.domain.id) {
            <g>
              <rect [attr.x]="tile.x" [attr.y]="tile.y" width="376" height="280" rx="8"
                    fill="var(--ink)" fill-opacity="0.02" stroke="var(--line)" stroke-width="0.8" />
              <text [attr.x]="tile.x + 20" [attr.y]="tile.y + 32" fill="var(--ink)"
                    font-size="13" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif">{{ tile.domain.name }}</text>
              <text [attr.x]="tile.x + 20" [attr.y]="tile.y + 52" fill="var(--muted)"
                    font-size="9" font-family="ui-monospace, Menlo, monospace">{{ tile.termCount }} terms &#183; {{ tile.conceptCount }} concepts</text>
              @for (t of tile.terms; track t.id) {
                <g (click)="selected.set(t)" style="cursor: pointer">
                  <rect [attr.x]="tile.x + 20 + (t.col * 172)" [attr.y]="tile.y + 72 + (t.row * 36)" width="160" height="26" rx="6"
                        fill="var(--panel)" stroke="var(--line)" stroke-width="0.8" />
                  <circle [attr.cx]="tile.x + 34 + (t.col * 172)" [attr.cy]="tile.y + 85 + (t.row * 36)" r="3.5"
                          [attr.fill]="t.color" />
                  <text [attr.x]="tile.x + 44 + (t.col * 172)" [attr.y]="tile.y + 89 + (t.row * 36)" fill="var(--ink)"
                        font-size="9" font-family="ui-monospace, Menlo, monospace">{{ t.term.name }}</text>
                </g>
              }
              <text [attr.x]="tile.x + 20" [attr.y]="tile.y + 262" fill="var(--muted)"
                    font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">BUSINESS TERM &#8594; CONCEPT &#8594; COLUMN</text>
            </g>
          }
        </svg>
      </div>

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

  /** Domain tiles for the SVG map: positions + terms with type colors. */
  mapTiles(r: BusinessReport): {
    domain: BusinessDomain;
    x: number;
    y: number;
    termCount: number;
    conceptCount: number;
    terms: { id: string; term: BusinessTerm; col: number; row: number; color: string }[];
  }[] {
    const colors: Record<string, string> = {
      measure: 'var(--good)',
      event: 'var(--warn)',
      dimension: 'var(--muted)',
      entity: 'var(--accent)',
    };
    return r.domains.map((domain, i) => {
      const terms = this.termsOf(r, domain);
      return {
        domain,
        x: 20 + (i % 3) * 412,
        y: 20 + Math.floor(i / 3) * 300,
        termCount: terms.length,
        conceptCount: terms.reduce((n, t) => n + t.concepts.length, 0),
        terms: terms.map((t, j) => ({
          id: t.id,
          term: t,
          col: j % 2,
          row: Math.floor(j / 2),
          color: colors[t.type] ?? 'var(--muted)',
        })),
      };
    });
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
