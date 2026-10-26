import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { Graph, GraphNode, NodeKind } from '../core/api.types';

const LANE_ORDER: NodeKind[] = ['product', 'table', 'model', 'source', 'concept', 'column'];
const LANE_X: Record<NodeKind, number> = {
  product: 20, table: 260, model: 620, source: 980, concept: 1340, column: 260,
};
const NODE_W = 190;
const COL_W = 150;
const COL_SUB_DX = 160;

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
             style="max-width:420px" [value]="pick()"
             (input)="pick.set($any($event.target).value)"
             (keyup.enter)="load(pick())" />
      <button (click)="load(pick())">Load graph</button>
    </div>

    @if (graph(); as g) {
      @if (g.nodes.length === 0) {
        <p class="muted">No lineage found for this asset.</p>
      } @else {
        <div class="row" style="margin: 10px 0 6px">
          <button class="ghost" (click)="zoomBy(1.25)">zoom in</button>
          <button class="ghost" (click)="zoomBy(0.8)">zoom out</button>
          <button class="ghost" (click)="fit()">fit</button>
          <button class="ghost" (click)="resetView()">100%</button>
          <span class="small muted">{{ zoomPct() }}% &mdash; drag to pan &middot; ctrl+wheel to zoom</span>
        </div>
        <div class="card graph-viewport">
          <svg class="graph" #graphSvg
               (wheel)="onWheel($any($event))"
               (pointerdown)="startPan($any($event))"
               (pointermove)="movePan($any($event))"
               (pointerup)="endPan()"
               (pointercancel)="endPan()"
               (pointerleave)="endPan()"
               [class.panning]="panning()">
            <g [attr.transform]="transform()">
              @for (lane of lanes(); track lane.kind) {
                <text class="lane-label" [attr.x]="lane.x" y="16">{{ lane.kind }}</text>
              }
              @for (e of edges(); track e.key) {
                <path class="edge" [class]="e.kind" [attr.d]="e.path" />
              }
              @for (n of renderOrder(); track n.id) {
                <g (click)="open(n)">
                  <rect class="node" [class.column]="n.kind === 'column'"
                        [attr.x]="n.x" [attr.y]="n.y" [attr.width]="nodeWidth(n)" [attr.height]="nodeHeight(n)" />
                  <text class="node-label" [attr.x]="n.x + 10" [attr.y]="nodeLabelY(n)">{{ shortLabel(n) }}</text>
                  @if (n.kind !== 'column') {
                    <text class="node-sub" [attr.x]="n.x + 10" [attr.y]="nodeSubY(n)">{{ n.kind }}</text>
                  }
                </g>
              }
            </g>
          </svg>
        </div>
        <p class="small muted" style="margin-top:8px">
          Solid = derives_from/contains · dashed = joins_on · purple = implements (concept)
        </p>
      }
    } @else if (error(); as err) {
      <p class="muted">{{ err }}</p>
    } @else {
      <p class="muted">Pick an asset to see its lineage:</p>
      <div class="row">
        @for (t of pickerTables(); track t) {
          <button class="ghost" (click)="load(t)">{{ t }}</button>
        }
      </div>
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
  readonly pickerTables = signal<string[]>([]);

  readonly placed = computed<Placed[]>(() => {
    const g = this.graph();
    if (!g) return [];
    // Columns stack under their table (contains edges); everything else keeps
    // its lane — an explanatory diagram, not a hairball.
    const parentOf = new Map<string, string>();
    for (const e of g.edges) {
      if (e.kind === 'contains') parentOf.set(e.to, e.from);
    }
    // Height a parent must reserve for its stacked columns.
    const colCount = new Map<string, number>();
    for (const n of g.nodes) {
      if (n.kind !== 'column') continue;
      const parent = parentOf.get(n.id);
      if (parent) colCount.set(parent, (colCount.get(parent) ?? 0) + 1);
    }
    const positions = new Map<string, Placed>();
    const laneY = new Map<NodeKind, number>();
    const columns: GraphNode[] = [];
    for (const n of g.nodes) {
      if (n.kind === 'column') {
        columns.push(n);
        continue;
      }
      const y = laneY.get(n.kind) ?? 44;
      // Columns stack TWO-WIDE under their parent (halves the tower height so
      // fit-scale stays readable); rows grow by the stack height.
      laneY.set(n.kind, y + 52 + Math.ceil((colCount.get(n.id) ?? 0) / 2) * 22);
      positions.set(n.id, { ...n, x: LANE_X[n.kind] ?? 20, y });
    }
    const colIndex = new Map<string, number>();
    let orphanY = laneY.get('table') ?? 44;
    for (const n of columns) {
      const parentId = parentOf.get(n.id) ?? '';
      const parent = positions.get(parentId);
      const idx = colIndex.get(parentId) ?? 0;
      colIndex.set(parentId, idx + 1);
      if (parent) {
        positions.set(n.id, {
          ...n,
          x: parent.x + 14 + (idx % 2) * COL_SUB_DX,
          y: parent.y + 44 + Math.floor(idx / 2) * 22,
        });
      } else {
        positions.set(n.id, {
          ...n,
          x: LANE_X.column + (idx % 2) * COL_SUB_DX,
          y: orphanY + Math.floor(idx / 2) * 22,
        });
      }
    }
    orphanY += Math.ceil(columns.length / 2) * 22;
    return [...positions.values()];
  });

  /** SVG paints in document order — columns first so they sit behind boxes. */
  readonly renderOrder = computed<Placed[]>(() => {
    const nodes = this.placed();
    return [...nodes.filter((n) => n.kind === 'column'), ...nodes.filter((n) => n.kind !== 'column')];
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
      const y1 = a.y + this.nodeHeight(a) / 2;
      const y2 = b.y + this.nodeHeight(b) / 2;
      let path: string;
      if (e.kind === 'contains' && b.kind === 'column') {
        // Elbow down the gutter between the two column sub-stacks, then a
        // stub into the column's near edge.
        const gutter = a.x + 169;
        const edgeX = b.x < gutter ? b.x + COL_W : b.x;
        path = `M ${gutter} ${a.y + this.nodeHeight(a)} L ${gutter} ${y2} L ${edgeX} ${y2}`;
      } else if (Math.abs(a.x - b.x) < 5) {
        // Same lane (e.g. joins_on): loop out right, back into the right edge.
        const out = a.x + 230;
        path = `M ${a.x + this.nodeWidth(a)} ${y1} C ${out} ${y1}, ${out} ${y2}, ${b.x + this.nodeWidth(b)} ${y2}`;
      } else {
        const forward = b.x > a.x;
        const x1 = forward ? a.x + this.nodeWidth(a) : a.x;
        const x2 = forward ? b.x : b.x + this.nodeWidth(b);
        const mid = (x1 + x2) / 2;
        path = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
      }
      return [{
        key: `${e.from}->${e.to}:${e.kind}`,
        kind: e.kind,
        path,
      }];
    });
  });

  readonly width = computed(() =>
    Math.max(920, ...this.placed().map((n) => n.x + this.nodeWidth(n) + 20)),
  );
  readonly height = computed(() =>
    Math.max(160, ...this.placed().map((n) => n.y + this.nodeHeight(n) + 24)),
  );

  nodeWidth(n: Placed): number {
    return n.kind === 'column' ? COL_W : NODE_W;
  }

  // --- zoom & pan -------------------------------------------------------
  readonly scale = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly panning = signal(false);
  private dragMoved = false;
  private lastX = 0;
  private lastY = 0;
  private readonly graphSvg = viewChild<ElementRef<SVGElement>>('graphSvg');

  readonly transform = computed(
    () => `translate(${this.panX()} ${this.panY()}) scale(${this.scale()})`,
  );
  readonly zoomPct = computed(() => Math.round(this.scale() * 100));

  /** Fit the whole graph into the viewport whenever a new graph loads. */
  private readonly fitOnLoad = effect(() => {
    const g = this.graph();
    const el = this.graphSvg();
    if (g && el && g.nodes.length) {
      requestAnimationFrame(() => this.fit());
    }
  });

  zoomBy(factor: number): void {
    const el = this.graphSvg();
    if (!el) return;
    const r = el.nativeElement.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, factor);
  }

  private zoomAt(cx: number, cy: number, factor: number): void {
    const next = Math.min(3, Math.max(0.25, this.scale() * factor));
    const k = next / this.scale();
    this.panX.set(cx - (cx - this.panX()) * k);
    this.panY.set(cy - (cy - this.panY()) * k);
    this.scale.set(next);
  }

  onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling the page
    e.preventDefault();
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  startPan(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.dragMoved = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.panning.set(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  movePan(e: PointerEvent): void {
    if (!this.panning()) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (dx || dy) this.dragMoved = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.panX.update((v) => v + dx);
    this.panY.update((v) => v + dy);
  }

  endPan(): void {
    this.panning.set(false);
  }

  fit(): void {
    const el = this.graphSvg();
    if (!el) return;
    const r = el.nativeElement.getBoundingClientRect();
    const s = Math.min(1, (r.width - 24) / this.width(), (r.height - 24) / this.height());
    this.scale.set(s);
    this.panX.set((r.width - this.width() * s) / 2);
    this.panY.set((r.height - this.height() * s) / 2);
  }

  resetView(): void {
    this.scale.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

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
    if (initial) {
      this.load(initial);
    } else {
      void this.api.products().then((products) =>
        this.pickerTables.set([...new Set(products.flatMap((p) => p.tables))]),
      );
    }
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
    return n.label.length > (n.kind === 'column' ? 22 : 26) ? n.label.slice(0, n.kind === 'column' ? 21 : 25) + '…' : n.label;
  }

  open(n: Placed): void {
    if (this.dragMoved) return; // a pan just ended, not a real click
    if (n.kind === 'product') void this.router.navigate(['/product', n.id]);
    else if (n.kind === 'table' || n.kind === 'model' || n.kind === 'source') void this.router.navigate(['/table', n.id]);
  }
}
