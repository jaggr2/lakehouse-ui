import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { Graph, GraphNode, NodeKind } from '../core/api.types';

const LANE_ORDER: NodeKind[] = ['product', 'table', 'model', 'source', 'concept', 'column'];
const LANE_X: Record<NodeKind, number> = {
  product: 20, table: 250, model: 250, source: 480, concept: 700, column: 480,
};

interface Placed extends GraphNode {
  x: number;
  y: number;
}

@Component({
  selector: 'app-lineage-page',
  imports: [RouterLink],
  template: `
    <h2>Lineage &amp; relations</h2>
    <p class="page-sub">
      How data flows: products → models/tables → sources, with concept
      attachments and join edges. Click a box to open it.
    </p>

    <div class="row" style="margin-bottom: 14px">
      <input type="text" placeholder="table id, e.g. lake_gold.mail_activity"
             style="max-width:420px" [value]="table()"
             (keyup.enter)="load($any($event.target).value)" />
      <button (click)="load(pick())">Load graph</button>
      <a class="chip" routerLink="/table/lake_gold.media_activity">try media_activity</a>
    </div>

    @if (graph(); as g) {
      @if (g.nodes.length === 0) {
        <p class="muted">No lineage found for this asset.</p>
      } @else {
        <div class="card" style="overflow:auto">
          <svg class="graph" [attr.width]="width()" [attr.height]="height()">
            @for (lane of lanes(); track lane.kind) {
              <text class="lane-label" [attr.x]="lane.x" y="16">{{ lane.kind }}</text>
            }
            @for (e of edges(); track e.key) {
              <path class="edge" [class]="e.kind" [attr.d]="e.path" />
            }
            @for (n of placed(); track n.id) {
              <g (click)="open(n)">
                <rect class="node" [class.column]="n.kind === 'column'"
                      [attr.x]="n.x" [attr.y]="n.y" width="190" [attr.height]="nodeHeight(n)" />
                <text [attr.x]="n.x + 10" [attr.y]="nodeLabelY(n)">{{ shortLabel(n) }}</text>
                @if (n.kind !== 'column') {
                  <text [attr.x]="n.x + 10" [attr.y]="nodeSubY(n)" style="fill:#64748b; font-size:10px">{{ n.kind }}</text>
                }
              </g>
            }
          </svg>
        </div>
        <p class="small muted" style="margin-top:8px">
          Solid = derives_from/contains · dashed = joins_on · purple = implements (concept)
        </p>
      }
    } @else if (error(); as err) {
      <p class="muted">{{ err }}</p>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class LineagePage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly table = signal(this.route.snapshot.queryParamMap.get('table') ?? '');
  readonly pick = signal(this.table());
  readonly graph = signal<Graph | null>(null);
  readonly error = signal<string | null>(null);

  readonly placed = computed<Placed[]>(() => {
    const g = this.graph();
    if (!g) return [];
    // Columns stack under their table (contains edges); everything else keeps
    // its lane — an explanatory diagram, not a hairball.
    const parentOf = new Map<string, string>();
    for (const e of g.edges) {
      if (e.kind === 'contains') parentOf.set(e.to, e.from);
    }
    const positions = new Map<string, Placed>();
    const counts = new Map<NodeKind, number>();
    for (const n of g.nodes) {
      if (n.kind === 'column') continue;
      const idx = counts.get(n.kind) ?? 0;
      counts.set(n.kind, idx + 1);
      positions.set(n.id, { ...n, x: LANE_X[n.kind] ?? 20, y: 44 + idx * 52 });
    }
    const colIndex = new Map<string, number>();
    for (const n of g.nodes) {
      if (n.kind !== 'column') continue;
      const parentId = parentOf.get(n.id) ?? '';
      const parent = positions.get(parentId);
      const idx = colIndex.get(parentId) ?? 0;
      colIndex.set(parentId, idx + 1);
      positions.set(n.id, {
        ...n,
        x: parent ? parent.x + 14 : LANE_X.column,
        y: parent ? parent.y + 44 + idx * 22 : 44 + idx * 22,
      });
    }
    return [...positions.values()];
  });

  readonly lanes = computed(() => {
    const kinds = new Set(this.graph()?.nodes.map((n) => n.kind) ?? []);
    return LANE_ORDER.filter((k) => kinds.has(k) && k !== 'column').map((k) => ({ kind: k, x: (LANE_X[k] ?? 20) + 4 }));
  });

  readonly edges = computed(() => {
    const pos = new Map(this.placed().map((n) => [n.id, n]));
    return (this.graph()?.edges ?? []).flatMap((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return [];
      const hA = this.nodeHeight(a);
      const x1 = a.x + 190;
      const y1 = a.y + hA / 2;
      const x2 = b.x;
      const y2 = b.y + this.nodeHeight(b) / 2;
      const mid = (x1 + x2) / 2;
      return [{
        key: `${e.from}->${e.to}:${e.kind}`,
        kind: e.kind,
        path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
      }];
    });
  });

  readonly width = computed(() => 920);
  readonly height = computed(() =>
    Math.max(160, ...this.placed().map((n) => n.y + this.nodeHeight(n) + 24)),
  );

  nodeHeight(n: Placed): number {
    return n.kind === 'column' ? 18 : 38;
  }

  nodeLabelY(n: Placed): number {
    return n.kind === 'column' ? n.y + 13 : n.y + 16;
  }

  nodeSubY(n: Placed): number {
    return n.y + 30;
  }

  constructor() {
    const initial = this.table();
    if (initial) this.load(initial);
  }

  load(table: string): void {
    const t = table.trim();
    if (!t) return;
    this.table.set(t);
    this.pick.set(t);
    this.graph.set(null);
    this.error.set(null);
    void this.router.navigate([], { queryParams: { table: t } });
    void this.api
      .lineage(t, 2)
      .then((g) => this.graph.set(g))
      .catch((e: Error) => this.error.set(e.message));
  }

  shortLabel(n: Placed): string {
    return n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
  }

  open(n: Placed): void {
    if (n.kind === 'product') void this.router.navigate(['/product', n.id]);
    else if (n.kind === 'table' || n.kind === 'model' || n.kind === 'source') void this.router.navigate(['/table', n.id]);
  }
}
