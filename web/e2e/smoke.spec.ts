import { expect, test } from '@playwright/test';

test('catalog lists the governed data products', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Data products' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mail Activity' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Parcel Events' })).toBeVisible();
});

test('search surfaces tables and concepts', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search products, tables, columns, concepts…').fill('mail');
  await expect(page.getByRole('heading', { name: /Search results for/ })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('product page shows purpose, limitations and tables', async ({ page }) => {
  await page.goto('/product/mail-activity');
  await expect(page.getByRole('heading', { name: 'Mail Activity' })).toBeVisible();
  await expect(page.getByText('Bodies capped at 32 KB per message')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'lake_gold.mail_activity' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'columns & quality' })).toBeVisible();
});

test('table page renders columns with concepts', async ({ page }) => {
  await page.goto('/table/mail_activity');
  await expect(page.getByRole('heading', { name: 'mail_activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Columns' })).toBeVisible();
});
