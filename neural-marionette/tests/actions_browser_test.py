"""Action playback and real local model smoke test; fake camera, not human acceptance."""
import json, pathlib, os
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('EVIDENCE_DIR','docs/evidence/v3')
OUT.mkdir(parents=True,exist_ok=True)
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('TEST_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
    page.wait_for_function('window.__NM_DIAGNOSTICS__ && window.__NM_DIAGNOSTICS__().frames>10')
    page.screenshot(path=str(OUT/'standby.png'),full_page=True)
    assert page.locator('#action-buttons button').count()==6
    results={}
    for action in ['idle','run','turn','load','crouch','jump']:
        page.locator('[data-action="'+action+'"]').click();page.wait_for_timeout(450)
        diag=page.evaluate('window.__NM_DIAGNOSTICS__()')
        assert diag['action']==action,diag
        assert diag['mode']=='demo'
        assert all(f['y']>=.199 for f in diag['feet'])
        page.locator('#stage').screenshot(path=str(OUT/(action+'.png')))
        results[action]=diag
        if action=='turn':
            assert min(f['y'] for f in diag['feet'])>.65
            page.locator('[data-action="idle"]').click();page.wait_for_timeout(1200)
        if action=='jump':
            assert diag['motion']['height']>1.8
            page.wait_for_timeout(1500)
            assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='idle'
            assert all(abs(f['y']-.2)<.002 for f in page.evaluate('window.__NM_DIAGNOSTICS__().feet'))
    page.keyboard.press('2');page.wait_for_timeout(350)
    assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='run'
    page.locator('#record').click();page.wait_for_timeout(800)
    with page.expect_download() as download:page.locator('#record').click()
    assert 'SIMULATION' in download.value.suggested_filename
    page.locator('#gesture-control').click()
    page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000)
    page.wait_for_timeout(2000)
    camera=page.evaluate('window.__NM_DIAGNOSTICS__()')
    assert camera['workerReady'] and camera['actionOverride'] is None
    assert camera['action']=='idle' and camera['points']==0
    assert camera['frameAgeMs']>0
    page.screenshot(path=str(OUT/'camera-fake.png'),full_page=True)
    page.locator('#camera-toggle').click()
    assert page.evaluate("document.querySelector('#camera').srcObject===null")
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    assert not errors,errors
    result={'kind':'synthetic input and fake camera, NOT real-hand latency validation','actions':results,'localModelCamera':camera,'uncaughtErrors':errors}
    (OUT/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({'actions':list(results),'local_model':'passed','mobile':'passed','recording':'passed','errors':errors}))
    browser.close()
