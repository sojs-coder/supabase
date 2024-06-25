import { Page, expect, test } from '@playwright/test'
import { kebabCase } from 'lodash'

const dismissToast = async (page: Page) => {
  await page.locator('#toast').getByRole('button').waitFor({ state: 'visible' })
  await page.locator('#toast').getByRole('button').click()
}

test.describe('Table Editor page', () => {
  test.beforeEach(async ({ page }) => {
    const tableResponsePromise = page.waitForResponse(
      'http://localhost:8082/api/pg-meta/default/query?key=public-entity-types',
      { timeout: 0 }
    )
    await page.goto('/project/default/editor')
    await tableResponsePromise
  })

  test('should create a new table, view its definition, add new rows, sort and filter', async ({
    page,
  }, testInfo) => {
    const tableName = `${kebabCase(testInfo.title).slice(0, 24)}-${testInfo.retry}-${Math.floor(Math.random() * 100)}`

    // The page has been loaded with the table data, we can now interact with the page
    await page.getByRole('button', { name: 'New table', exact: true }).click()
    await page.getByTestId('table-name-input').waitFor({ state: 'visible' })
    await page.getByTestId('table-name-input').click()
    await page.getByTestId('table-name-input').fill(tableName)

    // make the built-in created_at column nullable
    await page.getByTestId('created_at-extra-options').click()
    await page.getByText('Is Nullable').click()
    // the force option is needed because the button is obscured by the popover but we just want to close the popover.
    await page.getByTestId('created_at-extra-options').click({ force: true })

    // add a new column and add default value
    await page.getByRole('button', { name: 'Add column' }).click()
    await page.getByRole('textbox', { name: 'column_name' }).click()
    await page.getByRole('textbox', { name: 'column_name' }).fill('defaultValueColumn')
    await page.getByRole('button', { name: '---' }).click()
    await page.getByText('Signed two-byte integer').click()
    await page.getByTestId('defaultValueColumn-default-value').click()
    await page.getByTestId('defaultValueColumn-default-value').fill('2')

    await page.getByRole('button', { name: 'Save' }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Save' }).click()
    await dismissToast(page)

    // view its definition
    await page.getByText('definition').click()
    await expect(page.locator('div.view-lines')).toContainText(
      `CREATE  TABLE public.${tableName} (  id bigint GENERATED BY DEFAULT AS IDENTITY ,  created_at timestamp with time zone NULL DEFAULT now(),  \"defaultValueColumn\" smallint NULL DEFAULT '2'::smallint,  CONSTRAINT ${tableName}_pkey PRIMARY KEY (id)) TABLESPACE pg_default;`
    )

    // add a new row
    await page.getByRole('button', { name: tableName }).click()
    await page.getByTestId('table-editor-insert-new-row').click()
    await page.getByText('Insert a new row into').click()
    await page.getByTestId('defaultValueColumn-input').click()
    await page.getByTestId('defaultValueColumn-input').fill('100')
    await page.getByTestId('action-bar-save-row').click()
    await dismissToast(page)

    // add a second row
    await page.getByRole('button', { name: tableName }).click()
    await page.getByTestId('table-editor-insert-new-row').click()
    await page.getByText('Insert a new row into').click()
    // the default value should be '100' for defaultValueColumn
    await page.getByTestId('action-bar-save-row').click()
    await dismissToast(page)

    await expect(page.getByRole('grid')).toContainText('2')
    await expect(page.getByRole('grid')).toContainText('100')

    // sort by the a column
    await page.getByRole('button', { name: 'Sort' }).click()
    await page.getByTestId('table-editor-pick-column-to-sort-button').click()
    await page.getByLabel('Pick a column to sort by').getByText('defaultValueColumn').click()
    await page.getByRole('button', { name: 'Apply sorting' }).click()
    // click away to close the sorting dialog
    await page
      .locator('div')
      .filter({ hasText: /^Table Editor$/ })
      .click()
    // expect the row to be sorted by defaultValueColumn. They're inserted in the order 100, 2
    await expect(page.locator('div.rdg-row:nth-child(2)')).toContainText('2')
    await expect(page.locator('div.rdg-row:nth-child(3)')).toContainText('100')
    // remove the sorting
    await page.getByRole('button', { name: 'Sorted by 1 rule' }).click()
    await page.getByRole('dialog').getByRole('button').nth(1).click()

    // filter by a column
    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('button', { name: 'id' }).click()
    await page.getByLabel('id').getByText('defaultValueColumn').click()
    await page.getByPlaceholder('Enter a value').click()
    await page.getByPlaceholder('Enter a value').fill('2')
    await page.getByRole('button', { name: 'Apply filter' }).click()
    // click away to close the filter dialog
    await page
      .locator('div')
      .filter({ hasText: /^Table Editor$/ })
      .click()
    await expect(page.getByRole('grid')).toContainText('2')
    await expect(page.getByRole('grid')).not.toContainText('100')
  })

  test('should check the auth schema', async ({ page }) => {
    const tableResponsePromise = page.waitForResponse(
      'http://localhost:8082/api/pg-meta/default/query?key=public-entity-types',
      { timeout: 0 }
    )

    await page.getByRole('button', { name: 'schema: public' }).click()
    await page.getByRole('option', { name: 'auth' }).click()

    // wait for the table data to load for the auth schema
    await tableResponsePromise

    // extract the tables names from the sidebar
    const tables = await page
      .getByTestId('tables-list')
      .innerText()
      .then((text) => text.split('\n'))

    // expect the tables list to contain the following tables (additional tables may be present)
    expect(tables).toEqual(
      expect.arrayContaining([
        'audit_log_entries',
        'flow_state',
        'identities',
        'instances',
        'mfa_amr_claims',
        'mfa_challenges',
        'mfa_factors',
        'refresh_tokens',
        'saml_providers',
        'saml_relay_states',
        'schema_migrations',
        'sessions',
        'sso_domains',
        'sso_providers',
        'users',
      ])
    )
  })
})
