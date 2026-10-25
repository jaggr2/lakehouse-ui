import { Component } from '@angular/core';

/**
 * Architecture map of the whole lakehouse application (diagram-design
 * "Architecture" type, lakehouse-ui profile). Theme-aware: every color is a
 * CSS variable from styles.css, so the figure flips with the app theme.
 */
@Component({
  selector: 'app-architecture-page',
  template: `
    <h2>Architecture</h2>
    <p class="page-sub">
      How the whole system fits together: sources and ingest, the AWS lakehouse,
      serving and app, and where the ODCS/ODPS/semantics definitions live and
      flow. Solid arrows carry data, dashed arrows carry metadata and governance.
    </p>

    <div class="card arch-frame">
      <svg class="arch" viewBox="0 0 1344 920" role="img"
           aria-labelledby="lakehouse-arch-title lakehouse-arch-desc">
        <title id="lakehouse-arch-title">Lakehouse application architecture</title>
        <desc id="lakehouse-arch-desc">
          Data flows from Home Assistant, an exporter add-on and a GitHub Actions
          ingest runner into the AWS lakehouse (S3 and Iceberg curated by dbt,
          queried through Glue and Athena), served via lakehouse-mcp and Warden to
          the catalog web app, while contracts, product specs and semantics defined
          as code flow into curation checks, the MCP catalog API and the app's
          query grounding, with corrections flowing back into the definitions.
        </desc>

        <defs>
          <marker id="arch-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--muted)" />
          </marker>
          <marker id="arch-arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--accent)" />
          </marker>
          <marker id="arch-arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--accent)" />
          </marker>
        </defs>

        <!-- paper -->
        <rect width="1344" height="920" fill="var(--bg)" />

        <!-- zones -->
        <g>
          <rect x="24" y="64" width="296" height="632" rx="8" fill="var(--ink)" fill-opacity="0.02" stroke="var(--line)" stroke-width="0.8" />
          <rect x="36" y="68" width="96" height="12" rx="2" fill="var(--bg)" />
          <text x="84" y="77" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.18em">SOURCES &amp; INGEST</text>

          <rect x="488" y="64" width="296" height="632" rx="8" fill="var(--ink)" fill-opacity="0.02" stroke="var(--line)" stroke-width="0.8" />
          <rect x="500" y="68" width="160" height="12" rx="2" fill="var(--bg)" />
          <text x="580" y="77" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.18em">AWS LAKEHOUSE · EU-CENTRAL-1</text>

          <rect x="952" y="64" width="296" height="632" rx="8" fill="var(--ink)" fill-opacity="0.02" stroke="var(--line)" stroke-width="0.8" />
          <rect x="964" y="68" width="80" height="12" rx="2" fill="var(--bg)" />
          <text x="1004" y="77" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.18em">SERVING &amp; APP</text>
        </g>

        <!-- connectors (before boxes) -->
        <g fill="none" stroke="var(--muted)" stroke-width="1.2">
          <line x1="172" y1="192" x2="172" y2="264" marker-end="url(#arch-arrow)" />
          <path d="M 288,300 H 396 Q 404,300 404,292 V 156 Q 404,148 412,148 H 520" marker-end="url(#arch-arrow)" />
          <path d="M 56,156 H 48 Q 40,156 40,164 V 444 Q 40,452 48,452 H 56" stroke-dasharray="4,3" stroke-width="1" marker-end="url(#arch-arrow)" />
          <path d="M 288,452 H 428 Q 436,452 436,444 V 192 Q 436,184 444,184 H 520" marker-end="url(#arch-arrow)" />
          <line x1="604" y1="208" x2="604" y2="328" marker-end="url(#arch-arrow)" />
          <line x1="668" y1="328" x2="668" y2="208" marker-end="url(#arch-arrow)" />
          <path d="M 548,208 V 240 Q 548,248 540,248 H 504 Q 496,248 496,256 V 524 Q 496,532 504,532 H 520" marker-end="url(#arch-arrow)" />
          <path d="M 752,532 H 912 Q 920,532 920,524 V 172 Q 920,164 928,164 H 984" marker-end="url(#arch-arrow)" />
          <line x1="1060" y1="312" x2="1060" y2="208" marker-end="url(#arch-arrow)" />
          <line x1="1140" y1="504" x2="1140" y2="400" marker-end="url(#arch-arrow)" />
          <path d="M 448,712 V 372 Q 448,364 456,364 H 520" stroke-dasharray="4,3" stroke-width="1" marker-end="url(#arch-arrow)" />
          <path d="M 1016,760 H 1280 Q 1288,760 1288,752 V 172 Q 1288,164 1280,164 H 1216" stroke-dasharray="4,3" stroke-width="1" marker-end="url(#arch-arrow)" />
          <path d="M 888,712 V 556 Q 888,548 896,548 H 984" stroke-dasharray="4,3" stroke-width="1" marker-end="url(#arch-arrow)" />
          <path d="M 1150,592 V 676 Q 1150,684 1142,684 H 988 Q 980,684 980,692 V 712" stroke-dasharray="4,3" stroke-width="1" marker-end="url(#arch-arrow)" />
        </g>

        <!-- connector labels (masks + text, before boxes) -->
        <g>
          <rect x="184" y="216" width="48" height="12" rx="2" fill="var(--bg)" />
          <text x="208" y="225" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">STATES</text>

          <rect x="416" y="212" width="56" height="12" rx="2" fill="var(--bg)" />
          <text x="444" y="221" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">PARQUET</text>

          <rect x="48" y="212" width="92" height="12" rx="2" fill="var(--bg)" />
          <text x="94" y="221" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">DISPATCH 02:20</text>

          <rect x="448" y="276" width="48" height="12" rx="2" fill="var(--bg)" />
          <text x="472" y="285" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">INGEST</text>

          <rect x="508" y="300" width="56" height="12" rx="2" fill="var(--bg)" />
          <text x="536" y="309" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">ICEBERG</text>

          <rect x="616" y="244" width="76" height="12" rx="2" fill="var(--bg)" />
          <text x="654" y="253" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">READ BRONZE</text>

          <rect x="696" y="268" width="72" height="12" rx="2" fill="var(--bg)" />
          <text x="732" y="277" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">WRITE GOLD</text>

          <rect x="820" y="372" width="88" height="12" rx="2" fill="var(--bg)" />
          <text x="908" y="381" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="end" letter-spacing="0.06em">GOLD-ONLY SQL</text>

          <rect x="1072" y="248" width="64" height="12" rx="2" fill="var(--bg)" />
          <text x="1104" y="257" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">MCP CALLS</text>

          <rect x="1152" y="440" width="60" height="12" rx="2" fill="var(--bg)" />
          <text x="1182" y="449" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">LLM CALL</text>

          <rect x="344" y="560" width="92" height="12" rx="2" fill="var(--bg)" />
          <text x="436" y="569" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="end" letter-spacing="0.06em">CONTRACT CHECK</text>

          <rect x="1188" y="452" width="88" height="12" rx="2" fill="var(--bg)" />
          <text x="1276" y="461" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="end" letter-spacing="0.06em">ODCS/ODPS API</text>

          <rect x="900" y="612" width="64" height="12" rx="2" fill="var(--bg)" />
          <text x="932" y="621" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">SEMANTICS</text>

          <rect x="1020" y="660" width="76" height="12" rx="2" fill="var(--bg)" />
          <text x="1058" y="669" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.06em">CORRECTIONS</text>
        </g>

        <!-- nodes -->
        <g>
          <!-- N1 Home Assistant (external) -->
          <rect x="56" y="120" width="232" height="72" rx="6" fill="var(--bg)" />
          <rect x="56" y="120" width="232" height="72" rx="6" fill="var(--ink)" fill-opacity="0.03" stroke="var(--ink)" stroke-opacity="0.30" />
          <rect x="68" y="130" width="28" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="82" y="140" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">HA</text>
          <g transform="translate(252,128)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M21 16.008v-8.018a1.98 1.98 0 0 0 -1 -1.717l-7 -4.008a2.016 2.016 0 0 0 -2 0l-7 4.008c-.619 .355 -1 1.01 -1 1.718v8.018c0 .709 .381 1.363 1 1.717l7 4.008a2.016 2.016 0 0 0 2 0l7 -4.008c.619 -.355 1 -1.01 1 -1.718" />
            <path d="M12 22v-10" /> <path d="M12 12l8.73 -5.04" /> <path d="M3.27 6.96l8.73 5.04" />
          </g>
          <text x="172" y="164" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">Home Assistant</text>
          <text x="172" y="180" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">HAOS · 192.168.30.10</text>

          <!-- N2 exporter add-on (backend) -->
          <rect x="56" y="264" width="232" height="72" rx="6" fill="var(--bg)" />
          <rect x="56" y="264" width="232" height="72" rx="6" fill="var(--panel)" stroke="var(--ink)" />
          <rect x="68" y="274" width="48" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="92" y="284" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">ADD-ON</text>
          <g transform="translate(252,272)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
            <path d="M12 12l8 -4.5" /> <path d="M12 12l0 9" /> <path d="M12 12l-8 -4.5" /> <path d="M16 5.25l-8 4.5" />
          </g>
          <text x="172" y="308" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">s3-lakehouse-exporter</text>
          <text x="172" y="324" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">HA add-on · parquet writer</text>

          <!-- N3 GitHub Actions runner (backend) -->
          <rect x="56" y="408" width="232" height="104" rx="6" fill="var(--bg)" />
          <rect x="56" y="408" width="232" height="104" rx="6" fill="var(--panel)" stroke="var(--ink)" />
          <rect x="68" y="418" width="28" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="82" y="428" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">CI</text>
          <g transform="translate(252,416)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
          </g>
          <text x="172" y="452" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">GitHub Actions runner</text>
          <text x="172" y="468" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">self-hosted · GitHub OIDC</text>
          <text x="172" y="484" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">arr · gmail · github · parcels</text>
          <text x="172" y="500" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">gmail: secrets dropped at ingest</text>

          <!-- N4 S3 + Iceberg (focal) -->
          <rect x="520" y="120" width="232" height="88" rx="6" fill="var(--bg)" />
          <rect x="520" y="120" width="232" height="88" rx="6" fill="var(--chip)" stroke="var(--accent)" stroke-width="1.2" />
          <rect x="532" y="130" width="40" height="14" rx="2" fill="none" stroke="var(--accent)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="552" y="140" fill="var(--ink)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">STORE</text>
          <g transform="translate(716,128)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent)" aria-hidden="true">
            <path d="M17 18.5a15.198 15.198 0 0 1 -7.37 1.44a14.62 14.62 0 0 1 -6.63 -2.94" />
            <path d="M19.5 21c.907 -1.411 1.451 -3.323 1.5 -5c-1.197 -.773 -2.577 -.935 -4 -1" />
            <path d="M3 11v-4.5a1.5 1.5 0 0 1 3 0v4.5" /> <path d="M3 9h3" />
            <path d="M9 5l1.2 6l1.8 -4l1.8 4l1.2 -6" />
            <path d="M18 10.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75" />
          </g>
          <text x="636" y="164" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">S3 + Iceberg · derog-lake</text>
          <text x="636" y="180" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">s3://derog-lake · eu-central-1</text>
          <text x="636" y="196" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">bronze → silver → gold</text>

          <!-- N5 dbt (backend) -->
          <rect x="520" y="328" width="232" height="72" rx="6" fill="var(--bg)" />
          <rect x="520" y="328" width="232" height="72" rx="6" fill="var(--panel)" stroke="var(--ink)" />
          <rect x="532" y="338" width="32" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="548" y="348" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">DBT</text>
          <g transform="translate(716,336)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
            <path d="M15 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M7 8l0 8" /> <path d="M7 8a4 4 0 0 0 4 4h4" />
          </g>
          <text x="636" y="372" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">dbt curation</text>
          <text x="636" y="388" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">silver → gold models</text>

          <!-- N6 Glue + Athena (store) -->
          <rect x="520" y="496" width="232" height="72" rx="6" fill="var(--bg)" />
          <rect x="520" y="496" width="232" height="72" rx="6" fill="var(--ink)" fill-opacity="0.05" stroke="var(--muted)" />
          <rect x="532" y="506" width="32" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="548" y="516" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">SQL</text>
          <g transform="translate(716,504)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
            <path d="M4 6v6a8 3 0 0 0 16 0v-6" /> <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
          </g>
          <text x="636" y="540" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">Glue Catalog + Athena v3</text>
          <text x="636" y="556" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">eu-central-1 · SQL engine</text>

          <!-- N7 lakehouse-mcp (backend) -->
          <rect x="984" y="120" width="232" height="88" rx="6" fill="var(--bg)" />
          <rect x="984" y="120" width="232" height="88" rx="6" fill="var(--panel)" stroke="var(--ink)" />
          <rect x="996" y="130" width="32" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="1012" y="140" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">MCP</text>
          <g transform="translate(1180,128)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2" />
            <path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2" />
          </g>
          <text x="1100" y="164" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">lakehouse-mcp</text>
          <text x="1100" y="180" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">gold-only SELECT · scan caps</text>
          <text x="1100" y="196" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">usage log · contracts API</text>

          <!-- N8 Warden (security) -->
          <rect x="984" y="312" width="232" height="88" rx="6" fill="var(--bg)" />
          <rect x="984" y="312" width="232" height="88" rx="6" fill="var(--accent)" fill-opacity="0.05" stroke="var(--accent)" stroke-opacity="0.50" stroke-dasharray="4,4" />
          <rect x="996" y="322" width="52" height="14" rx="2" fill="none" stroke="var(--accent)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="1022" y="332" fill="var(--ink)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">GATEWAY</text>
          <g transform="translate(1180,320)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M13 12v.01" /> <path d="M3 21h18" />
            <path d="M5 21v-16a2 2 0 0 1 2 -2h6m4 10.5v7.5" />
            <path d="M21 7h-7m3 -3l-3 3l3 3" />
          </g>
          <text x="1100" y="356" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">Warden</text>
          <text x="1100" y="372" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">warden.jaggi.xyz</text>
          <text x="1100" y="388" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">/mcp ACL · /llm budget · HITL</text>

          <!-- N9 catalog app (backend) -->
          <rect x="984" y="504" width="232" height="88" rx="6" fill="var(--bg)" />
          <rect x="984" y="504" width="232" height="88" rx="6" fill="var(--panel)" stroke="var(--ink)" />
          <rect x="996" y="514" width="32" height="14" rx="2" fill="none" stroke="var(--muted)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="1012" y="524" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">APP</text>
          <g transform="translate(1180,512)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M3.6 9h16.8" /> <path d="M3.6 15h16.8" />
            <path d="M11.5 3a17 17 0 0 0 0 18" /> <path d="M12.5 3a17 17 0 0 1 0 18" />
          </g>
          <text x="1100" y="548" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">catalog.jaggi.xyz</text>
          <text x="1100" y="564" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">Hono API + Angular SPA</text>
          <text x="1100" y="580" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">catalog · lineage · workbench</text>

          <!-- N10 definitions as code (focal) -->
          <rect x="392" y="712" width="624" height="104" rx="6" fill="var(--bg)" />
          <rect x="392" y="712" width="624" height="104" rx="6" fill="var(--chip)" stroke="var(--accent)" stroke-width="1.2" />
          <rect x="404" y="722" width="32" height="14" rx="2" fill="none" stroke="var(--accent)" stroke-opacity="0.40" stroke-width="0.8" />
          <text x="420" y="732" fill="var(--ink)" font-size="7" font-family="ui-monospace, Menlo, monospace" text-anchor="middle" letter-spacing="0.08em">GIT</text>
          <g transform="translate(980,720)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent)" aria-hidden="true">
            <path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
            <path d="M15 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /> <path d="M7 8l0 8" />
            <path d="M9 18h6a2 2 0 0 0 2 -2v-5" /> <path d="M14 14l3 -3l3 3" />
          </g>
          <text x="704" y="756" fill="var(--ink)" font-size="12" font-weight="600" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">Definitions as code — lakehouse/ (home-control-server-config)</text>
          <text x="704" y="772" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">contracts/*.odcs.yaml · products/*.odps.yaml</text>
          <text x="704" y="788" fill="var(--muted)" font-size="9" font-family="ui-monospace, Menlo, monospace" text-anchor="middle">semantics/: concepts · mappings · graph.json · golden_questions.yaml</text>
        </g>

        <!-- legend strip -->
        <g>
          <line x1="24" y1="856" x2="1320" y2="856" stroke="var(--line)" stroke-width="0.8" />
          <text x="24" y="878" fill="var(--muted)" font-size="7" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.18em">LEGEND</text>

          <line x1="112" y1="874" x2="144" y2="874" stroke="var(--muted)" stroke-width="1.2" />
          <text x="152" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">DATA FLOW</text>

          <line x1="264" y1="874" x2="296" y2="874" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4,3" />
          <text x="304" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">METADATA · GOVERNANCE</text>

          <rect x="488" y="868" width="24" height="12" rx="4" fill="var(--chip)" stroke="var(--accent)" stroke-width="1.2" />
          <text x="520" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">FOCAL</text>

          <rect x="616" y="868" width="24" height="12" rx="4" fill="var(--panel)" stroke="var(--ink)" />
          <text x="648" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">SERVICE</text>

          <rect x="744" y="868" width="24" height="12" rx="4" fill="var(--ink)" fill-opacity="0.05" stroke="var(--muted)" />
          <text x="776" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">STORE</text>

          <rect x="872" y="868" width="24" height="12" rx="4" fill="var(--accent)" fill-opacity="0.05" stroke="var(--accent)" stroke-opacity="0.50" stroke-dasharray="4,4" />
          <text x="904" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">GATEWAY</text>

          <rect x="1000" y="868" width="24" height="12" rx="4" fill="var(--ink)" fill-opacity="0.03" stroke="var(--ink)" stroke-opacity="0.30" />
          <text x="1032" y="878" fill="var(--muted)" font-size="8" font-family="ui-monospace, Menlo, monospace" letter-spacing="0.06em">EXTERNAL</text>
        </g>
      </svg>
    </div>

    <p class="small muted" style="margin-top:10px">
      Focal: the data store and the definitions repo. Sensitive mail is dropped at
      ingest; corrections from the app flow back as data, never code.
    </p>
  `,
})
export class ArchitecturePage {}
