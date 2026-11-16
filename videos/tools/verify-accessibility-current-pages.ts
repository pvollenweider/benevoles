// SPDX-License-Identifier: AGPL-3.0-only
/** Current-build browser preflight only. Does not replace native zoom/VoiceOver footage. */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchVideoBrowser, videoRequestProxy } from '../lib/public-hosts'
import { verifyProductBuild } from '../lib/product-build'
async function main() {
 const local='http://localhost:43102', base='https://www.benevol.app'
 assert.equal(process.env.VIDEO_BASE_URL,local)
 const product=await verifyProductBuild(local)
 const directory=path.resolve('videos/output/accessibility-keyboard-display/review/current-pages')
 await mkdir(directory,{recursive:true})
 const browser=await launchVideoBrowser(chromium,{env:{...process.env,LANG:'fr_CH.UTF-8',LC_ALL:'fr_CH.UTF-8'}})
 const checks:Record<string,unknown>={product,nativeZoom:false,nativeScreenReader:false,synchronizedVideo:false}
 try {
  const page=await browser.newPage({proxy:{server:videoRequestProxy(browser)!},ignoreHTTPSErrors:true,viewport:{width:1280,height:800},locale:'fr-CH',timezoneId:'Europe/Zurich'})
  await page.goto(base+'/admin/login')
  await page.getByLabel('Email',{exact:true}).fill('video.accessibility.owner@example.org')
  await page.getByLabel('Mot de passe',{exact:true}).fill(process.env.ORG_ADMIN_PASSWORD??'e2e-org-admin-password')
  await page.getByRole('button',{name:'Se connecter',exact:true}).click()
  await page.waitForURL(/\/admin\/dashboard/,{waitUntil:'domcontentloaded'})
  const admin=base+'/admin/events/video-accessibility-event'
  await page.goto(admin+'/shifts')
  const tabs=page.getByRole('navigation',{name:"Sections de l'événement",exact:true})
  await tabs.waitFor()
  await page.getByRole('button',{name:'Liste',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'Liste',exact:true}).getAttribute('aria-pressed'),'true')
  await page.screenshot({path:path.join(directory,'shifts-list.png')})
  const opener=page.getByRole('button',{name:/^Modifier le créneau/}).first()
  await opener.click()
  const editor=page.getByRole('group').filter({has:page.getByLabel('Libellé',{exact:true})})
  await editor.waitFor();await editor.getByRole('button',{name:'Annuler',exact:true}).click()
  assert(await opener.evaluate(el=>el===document.activeElement),'Editor cancel must restore actual opener focus')
  checks.editorCancelRestoresFocus=true
  await page.getByRole('button',{name:'Gérer les postes',exact:true}).click()
  await page.getByRole('list',{name:'Ordre des postes',exact:true}).waitFor()
  assert(await page.getByRole('button',{name:/^Cumul/}).count()>0)
  assert(await page.getByRole('button',{name:/^Descendre le poste/}).count()>0)
  await page.screenshot({path:path.join(directory,'roles-cumul.png')})
  const order=page.getByRole('list',{name:'Ordre des postes',exact:true})
  const before=await order.getByRole('listitem').allTextContents()
  await order.getByRole('button',{name:/^Descendre le poste/}).first().click()
  const after=await order.getByRole('listitem').allTextContents();assert.notDeepEqual(after,before)
  // Wait for the real save response before reload; click completion alone can
  // abort the pending request and falsely report a persistence defect.
  const saved = page.waitForResponse(r => r.url().includes('/api/admin/') && ['PUT','PATCH','POST'].includes(r.request().method()))
  await page.getByRole('button',{name:"Enregistrer l'ordre",exact:true}).click()
  const response = await saved; assert(response.ok()); await response.finished()
  await page.reload();await page.getByRole('button',{name:'Gérer les postes',exact:true}).click()
  assert.deepEqual(await order.getByRole('listitem').allTextContents(),after)
  await page.screenshot({path:path.join(directory,'role-reorder-persisted.png')})
  // Restore this preparation's original order using the real UI.
  await order.getByRole('listitem').nth(1).getByRole('button',{name:/^Monter le poste/}).click()
  const restored = page.waitForResponse(r => r.url().includes('/api/admin/') && ['PUT','PATCH','POST'].includes(r.request().method()))
  await page.getByRole('button',{name:"Enregistrer l'ordre",exact:true}).click()
  const restoredResponse = await restored; assert(restoredResponse.ok()); await restoredResponse.finished()
  await page.reload();await page.getByRole('button',{name:'Gérer les postes',exact:true}).click()
  assert.deepEqual(await order.getByRole('listitem').allTextContents(),before)
  checks.actualReorderPersistedAndRestored=true
  checks.currentTabs=true;checks.listView=true;checks.roleCumulAndReorderControls=true
  await page.goto(base+'/admin/settings/admins')
  await page.getByRole('heading',{name:'Charte des bénévoles',exact:true}).waitFor()
  await page.getByRole('switch',{name:"Assurance RC fournie par l'organisation",exact:true}).waitFor()
  await page.screenshot({path:path.join(directory,'charter.png')})
  checks.charterAndSwitch=true
  await page.goto(base+'/atelier-clavier?org=formation-clavier')
  await page.keyboard.press('Tab')
  const skip=page.getByRole('link',{name:/contenu/i}).first()
  assert(await skip.evaluate(el=>el===document.activeElement),'Actual first Tab must reach skip link')
  await page.keyboard.press('Enter')
  checks.actualSkipLink=true
  const slot=page.getByRole('button',{name:/, Accueil[^:]* : sélectionner/}).first()
  for(let i=0;i<100&&!await slot.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab')
  assert(await slot.evaluate(el=>el===document.activeElement))
  assert.equal(await page.locator('[data-shift-id][tabindex="0"]').count(),1)
  await page.getByText('← → : même poste',{exact:false}).waitFor()
  const firstBar=await slot.getAttribute('data-shift-id')
  await page.keyboard.press('ArrowRight')
  assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('data-shift-id')),firstBar)
  await page.keyboard.press('ArrowLeft')
  assert(await slot.evaluate(el=>el===document.activeElement))
  await page.keyboard.press('ArrowDown')
  assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('data-shift-id')),firstBar)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  assert(await slot.evaluate(el=>el===document.activeElement))
  await page.screenshot({path:path.join(directory,'public-frise-keyboard-hint.png')})
  await page.keyboard.press('Tab')
  assert(!await page.evaluate(()=>document.activeElement?.hasAttribute('data-shift-id')))
  await page.keyboard.press('Shift+Tab')
  assert(await slot.evaluate(el=>el===document.activeElement))
  checks.friseKeyboard={oneTabStopPerDay:true,leftRightSamePoste:true,upDownNeighbour:true,tabLeaves:true,returnsToLastBar:true,realHint:true}
  await page.keyboard.press('Space')
  const next=page.getByRole('button',{name:/^Continuer/})
  for(let i=0;i<100&&!await next.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab')
  assert(await next.evaluate(el=>el===document.activeElement));await page.keyboard.press('Enter')
  await page.getByRole('textbox',{name:'Prénom',exact:true}).waitFor()
  await page.screenshot({path:path.join(directory,'public-keyboard-form.png')})
  checks.publicKeyboardSelectionAndForm=true
  await page.getByRole('link',{name:'Accessibilité',exact:true}).click()
  await page.getByRole('heading',{name:/Accessibilité/i}).first().waitFor()
  await page.screenshot({path:path.join(directory,'accessibility-statement.png')})
  checks.actualFooterStatementLink=page.url()
  await writeFile(path.join(directory,'checks.json'),JSON.stringify(checks,null,2))
  console.log('Current tabs, Liste, Cumul, reorder controls, charter, real keyboard public selection and footer statement verified. Native footage still required.')
 } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
