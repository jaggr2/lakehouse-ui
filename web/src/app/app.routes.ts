import { Routes } from '@angular/router';
import { ArchitecturePage } from './pages/architecture-page';
import { CatalogPage } from './pages/catalog-page';
import { ProductPage } from './pages/product-page';
import { TablePage } from './pages/table-page';
import { LineagePage } from './pages/lineage-page';
import { ConceptsPage } from './pages/concepts-page';
import { WorkbenchPage } from './pages/workbench-page';

export const routes: Routes = [
  { path: '', component: CatalogPage },
  { path: 'product/:id', component: ProductPage },
  { path: 'table/:id', component: TablePage },
  { path: 'lineage', component: LineagePage },
  { path: 'concepts', component: ConceptsPage },
  { path: 'workbench', component: WorkbenchPage },
  { path: 'architecture', component: ArchitecturePage },
  { path: '**', redirectTo: '' },
];
