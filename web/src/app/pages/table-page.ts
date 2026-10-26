import { Component, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { ImpactReport, QualityReport, TableDetail, UsageReport } from '../core/api.types';

@Component({
  selector: 'app-table-page',
  imports: [RouterLink, DecimalPipe],
  template: `
    @if (t(); as table) {
      <h2 class="mono">{{ table.id }}</h2>
      <p class="page-sub">
        {{ table.columns.length }} columns · database {{ table.database }}
        · <a [routerLink]="['/lineage']" [queryParams]="{ table: table.id }">lineage</a>
      </p>

      <div class="grid cols3">
        <div class="card">
          <h4>Trust score</h4>
          @if (quality(); as q) {
            <div class="row">
              <div class="meter">
                <span [style.width.%]="q.trustScore" [style.background]="trustColor(q.trustScore)"></span>
              </div>
              <span class="badge-num">{{ q.trustScore | number: '1.0-0' }}</span>
              <span class="chip" [class]="statusChip(q.trust.status)">{{ q.trust.status }}</span>
            </div>
            @for (c of q.trust.components; track c.name) {
              <div class="row small" style="margin-top:8px">
                <strong style="width:74px">{{ c.name }}</strong>
                <div class="meter"><span [style.width.%]="c.score" [style.background]="c.known ? trustColor(c.score) : 'var(--line)'"></span></div>
                <span class="muted" style="flex:2; min-width:180px">{{ c.known ? c.evidence : 'no evidence' }}</span>
              </div>
            }
          } @else {
            <p class="muted small">Loading quality…</p>
          }
        </div>

        <div class="card">
          <h4>Usage ({{ usage()?.windowDays ?? 0 }} days)</h4>
          @if (usage(); as u) {
            <div class="row">
              <span class="badge-num">{{ u.totalQueries }}</span>
              <span class="muted small">queries</span>
            </div>
            <div class="row" style="margin-top:10px; align-items:flex-end; height:52px">
              @for (d of u.daily; track d.date) {
                <div [style.height.%]="barHeight(d.count, u.daily)"
                     [style.width.%]="100 / Math.max(u.daily.length, 1)"
                     [title]="d.date + ': ' + d.count"
                     style="background: var(--accent); border-radius: 2px"></div>
              }
            </div>
            <div class="row" style="margin-top:10px">
              @for (c of u.topConsumers; track c.actor) {
                <span class="chip gray">{{ c.actor }} · {{ c.queries }}</span>
              } @empty { <span class="muted small">no consumers yet</span> }
            </div>
          } @else {
            <p class="muted small">Loading usage…</p>
          }
        </div>

        <div class="card">
          <div class="row" style="justify-content: space-between">
            <h4 style="margin:0">Impact analysis</h4>
            <button class="ghost" (click)="loadImpact()">{{ impact() ? 're-run' : 'analyze' }}</button>
          </div>
          @if (impact(); as i) {
            <p class="small" style="margin-top:10px">
              If <span class="mono">{{ i.asset }}</span> changes,
              <strong>{{ i.downstream.models.length + i.downstream.contracts.length + i.downstream.products.length + i.downstream.queries.length }}</strong>
              objects are affected:
            </p>
            @if (i.downstream.models.length) {
              <p class="small muted" style="margin:10px 0 4px">models &middot; {{ i.downstream.models.length }}</p>
              <div class="row">
                @for (m of i.downstream.models; track m) {
                  <span class="chip gray mono">{{ modelLabel(m) }}</span>
                }
              </div>
            }
            @if (i.downstream.contracts.length) {
              <p class="small muted" style="margin:10px 0 4px">contracts &middot; {{ i.downstream.contracts.length }}</p>
              <div class="row">
                @for (c of i.downstream.contracts; track c) {
                  <a class="chip" [routerLink]="['/product', c]">{{ c }}</a>
                }
              </div>
            }
            @if (i.downstream.products.length) {
              <p class="small muted" style="margin:10px 0 4px">products &middot; {{ i.downstream.products.length }}</p>
              <div class="row">
                @for (p of i.downstream.products; track p) {
                  <a class="chip" [routerLink]="['/product', p]">{{ p }}</a>
                }
              </div>
            }
            @if (i.downstream.queries.length) {
              <p class="small muted" style="margin:10px 0 4px">recent queries &middot; {{ i.downstream.queries.length }}</p>
              @for (q of i.downstream.queries; track q) {
                <div class="small mono" style="word-break: break-all; margin: 2px 0">{{ q }}</div>
              }
            }
            @for (n of i.notes; track n) { <p class="small muted">{{ n }}</p> }
          } @else {
            <p class="muted small" style="margin-top:10px">
              Compute the blast radius of a change to this table or a column.
            </p>
          }
        </div>
      </div>

      <h3>Columns</h3>
      <table class="data">
        <thead><tr><th>Column</th><th>Type</th><th>Concept</th><th>Description</th></tr></thead>
        <tbody>
          @for (c of table.columns; track c.name) {
            <tr>
              <td class="mono">{{ c.name }}</td>
              <td class="muted small">{{ c.type }}</td>
              <td>
                @if (c.concept; as concept) {
                  <a class="chip" [routerLink]="['/concepts']">{{ concept }}</a>
                } @else { <span class="chip gray">unmapped</span> }
              </td>
              <td class="small">{{ c.description }}</td>
            </tr>
          }
        </tbody>
      </table>

      @if (quality(); as q) {
        <h3>Quality rules ({{ q.rules.length }})</h3>
        <table class="data">
          <thead><tr><th>Rule</th><th>Status</th><th>Source</th><th>Detail</th></tr></thead>
          <tbody>
            @for (r of q.rules; track r.name) {
              <tr>
                <td>{{ r.name }}</td>
                <td><span class="chip" [class]="statusChip(r.status)">{{ r.status }}</span></td>
                <td class="muted small">{{ r.source }}{{ r.column ? ' · ' + r.column : '' }}</td>
                <td class="small muted">{{ r.description }}</td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">No rules defined.</td></tr> }
          </tbody>
        </table>
      }
    } @else {
      <p class="muted">{{ error() ?? 'Loading…' }}</p>
    }
  `,
})
export class TablePage {
  private readonly api = inject(ApiService);
  readonly id = input.required<string>();
  readonly t = signal<TableDetail | null>(null);
  readonly quality = signal<QualityReport | null>(null);
  readonly usage = signal<UsageReport | null>(null);
  readonly impact = signal<ImpactReport | null>(null);
  readonly error = signal<string | null>(null);
  readonly Math = Math;

  constructor() {
    effect(() => {
      const id = this.id();
      this.error.set(null);
      this.impact.set(null);
      void this.api.table(id).then((t) => this.t.set(t)).catch((e: Error) => this.error.set(e.message));
      void this.api.quality(id).then((q) => this.quality.set(q)).catch(() => this.quality.set(null));
      void this.api.usage(id).then((u) => this.usage.set(u)).catch(() => this.usage.set(null));
    });
  }

  loadImpact(): void {
    void this.api.impact(this.id()).then((i) => this.impact.set(i));
  }

  modelLabel(uniqueId: string): string {
    return uniqueId.replace(/^(model|source)\.[^.]+\./, '');
  }

  barHeight(count: number, daily: { count: number }[]): number {
    const max = Math.max(...daily.map((d) => d.count), 1);
    return Math.max((count / max) * 100, 4);
  }

  trustColor(score: number): string {
    return score >= 80 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
  }

  statusChip(status: string): string {
    if (status === 'pass' || status === 'trusted') return 'chip good';
    if (status === 'warn' || status === 'mixed') return 'chip warn';
    if (status === 'fail' || status === 'weak') return 'chip bad';
    return 'chip gray';
  }
}
