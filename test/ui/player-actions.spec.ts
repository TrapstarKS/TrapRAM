import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockApp } from './mock'

const activity = (page: Page) => page.getByRole('region', { name: 'Player activity' })
const join = (page: Page) => page.getByRole('button', { name: 'Join server', exact: true })
const calls = (page: Page, channel: string) => page.evaluate(channel => (window as any).__mock.calls.filter((c: any) => c.channel === channel), channel)
async function findPlayer(page: Page, name = 'FirstPlayer') {
  await page.getByRole('textbox', { name: 'Player username or User ID' }).fill(name)
  await page.getByRole('button', { name: 'Find player', exact: true }).click()
  await expect(activity(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh player activity' })).toBeEnabled()
}

for (const scenario of [
  { name: 'offline', row: { presence: { type: 0, lastLocation: '' } }, label: 'Offline' },
  { name: 'online', row: { presence: { type: 1, lastLocation: 'Website' } }, label: 'Online' },
  { name: 'Studio', row: { presence: { type: 3, lastLocation: 'Studio' } }, label: 'In Roblox Studio' },
  { name: 'hidden game', row: { presence: { type: 2, lastLocation: '' } }, label: 'Experience not shared' },
  { name: 'missing presence', row: {}, label: 'Activity unavailable' },
  { name: 'failed presence', row: { error: 'Roblox is temporarily unavailable' }, label: 'Activity unavailable' }
]) {
  test(`${scenario.name} is explained before joining, without blocking friend/follow`, async ({ page }) => {
    await mockApp(page)
    await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).check()
    await page.evaluate(row => { (window as any).__mock.playerPresence.default = row }, scenario.row)
    await findPlayer(page)
    await expect(activity(page).getByText(scenario.label, { exact: true })).toBeVisible()
    await expect(join(page)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Friend request', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled()
    expect(await calls(page, 'launch:player')).toHaveLength(0)
  })
}

test('shows the game and joins only viewers of the displayed destination', async ({ page }) => {
  await mockApp(page)
  await page.getByRole('checkbox', { name: 'Select all visible accounts' }).check()
  await page.evaluate(() => { (window as any).__mock.playerPresence['2'] = { presence: { type: 2, lastLocation: '' } } })
  await findPlayer(page)
  await expect(activity(page).getByText('In game', { exact: true })).toBeVisible()
  await expect(activity(page).getByText('Blox Fruits', { exact: true })).toBeVisible()
  await expect(activity(page).getByText('Place ID: 2753915549', { exact: true })).toBeVisible()
  await expect(activity(page).getByText(/1 of 2 selected accounts can see this server/)).toBeVisible()
  expect(await calls(page, 'launch:player')).toHaveLength(0)
  expect((await calls(page, 'player:presence'))[0].args).toEqual([[1, 2], 100])
  await expect(page.getByText('player-server-a', { exact: true })).toHaveCount(0)
  await join(page).click()
  expect((await calls(page, 'launch:player'))[0].args).toEqual([[1], 100, { placeId: 2753915549, gameId: 'player-server-a' }])
})

test('public activity remains read-only until a valid account is selected', async ({ page }) => {
  await mockApp(page)
  await findPlayer(page)
  expect((await calls(page, 'player:presence'))[0].args).toEqual([[], 100])
  await expect(join(page)).toBeDisabled()
  await expect(activity(page).getByText(/Select an account with a valid session/)).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select Atlas', exact: true }).check()
  await expect(join(page)).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).check()
  await expect(join(page)).toBeEnabled()
})

test('uses the activity and game details visible to either selected account', async ({ page }) => {
  await mockApp(page)
  await page.getByRole('checkbox', { name: 'Select all visible accounts' }).check()
  await page.evaluate(() => {
    const m = (window as any).__mock
    m.playerPresence['1'] = { presence: { type: 0, lastLocation: '' } }
    m.playerPresence['2'] = { presence: { type: 1, lastLocation: 'Website' } }
  })
  await findPlayer(page)
  await expect(activity(page).getByText('Online', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    const m = (window as any).__mock
    m.playerPresence['1'] = { presence: { type: 2, lastLocation: '' } }
    m.playerPresence['2'] = { presence: { type: 2, lastLocation: 'Blox Fruits', placeId: 2753915549 } }
  })
  await page.getByRole('button', { name: 'Refresh player activity' }).click()
  await expect(activity(page).getByText('Blox Fruits', { exact: true })).toBeVisible()
  await expect(join(page)).toBeDisabled()
})

test('editing a pending lookup cannot restore the previous player', async ({ page }) => {
  await mockApp(page)
  await page.evaluate(() => { (window as any).__mock.delays['player:lookup'] = 700 })
  const input = page.getByRole('textbox', { name: 'Player username or User ID' })
  await input.fill('FirstPlayer')
  await page.getByRole('button', { name: 'Find player', exact: true }).click()
  await input.fill('SecondPlayer')
  await page.evaluate(() => { (window as any).__mock.delays['player:lookup'] = 0 })
  await page.getByRole('button', { name: 'Find player', exact: true }).click()
  await expect(page.getByText('@SecondPlayer · 200', { exact: true })).toBeVisible()
  await page.waitForTimeout(800)
  await expect(page.getByText('@FirstPlayer · 100', { exact: true })).toHaveCount(0)
  await expect(page.getByText('@SecondPlayer · 200', { exact: true })).toBeVisible()
})

test('changing viewers discards a delayed presence from the previous selection', async ({ page }) => {
  await mockApp(page)
  await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).check()
  await findPlayer(page)
  await page.evaluate(() => { (window as any).__mock.delays['player:presence'] = 700 })
  await page.getByRole('button', { name: 'Refresh player activity' }).click()
  await expect(join(page)).toBeDisabled()
  await page.evaluate(() => {
    const m = (window as any).__mock
    m.delays['player:presence'] = 0
    m.playerPresence['2'] = { presence: { type: 0, lastLocation: '' } }
  })
  await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Select Nova', exact: true }).check()
  await expect(activity(page).getByText('Offline', { exact: true })).toBeVisible()
  await page.waitForTimeout(800)
  await expect(activity(page).getByText('Offline', { exact: true })).toBeVisible()
  await expect(join(page)).toBeDisabled()
})

test('activity polls, clears failed data and supports manual retry', async ({ page }) => {
  await page.clock.install()
  await mockApp(page)
  await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).check()
  await findPlayer(page)
  await expect(join(page)).toBeEnabled()
  await page.evaluate(() => { (window as any).__mock.failures['player:presence'] = 'Connection lost' })
  await page.clock.runFor(15_100)
  await expect(activity(page).getByText('Activity unavailable', { exact: true })).toBeVisible()
  await expect(activity(page).getByText('Blox Fruits', { exact: true })).toHaveCount(0)
  await expect(join(page)).toBeDisabled()
  await page.evaluate(() => {
    const m = (window as any).__mock
    delete m.failures['player:presence']
    m.playerPresence.default = { presence: { type: 2, lastLocation: 'Adopt Me!', placeId: 920587237, gameId: 'new-server' } }
  })
  await page.getByRole('button', { name: 'Refresh player activity' }).click()
  await expect(activity(page).getByText('Adopt Me!', { exact: true })).toBeVisible()
  await expect(join(page)).toBeEnabled()
})

for (const theme of ['dark', 'light']) for (const width of [1180, 320]) {
  test(`populated Player actions is accessible at ${width}px in ${theme} mode`, async ({ page }) => {
    await mockApp(page)
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('checkbox', { name: 'Select Orbit', exact: true }).check()
    await findPlayer(page)
    // Apply the theme through the visible settings flow so store and DOM agree.
    if (theme === 'light') {
      await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('button', { name: 'Light', exact: true }).click()
      await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Launch', exact: true }).click()
      await findPlayer(page)
    }
    await activity(page).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Player actions', exact: true }) })
    await section.screenshot({ path: `test-results/player-actions-${theme}-${width}.png`, animations: 'disabled' })
  })
}
