"""Exercise the real studio UI with a synthetic landmark source, not real-hand validation."""
import pathlib,json,tempfile
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(tempfile.gettempdir())/'neural-marionette-v2-tests/gesture-studio';OUT.mkdir(parents=True,exist_ok=True)
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1200},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''window.Worker=class {
      postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
      if(d.type==='frame'){d.bitmap.close();const points=window.fixtureHand&&!window.noHand?fixtureHand(window.handKind||'open',{x:window.still?0:.1*Math.sin(performance.now()/140)}):null;
      queueMicrotask(()=>this.onmessage?.({data:{type:'result',timestamp:d.timestamp,inferenceMs:0,landmarks:points}}));}}
      terminate(){this.onmessage=null;}
    };''')
    def setup():
        page.wait_for_load_state('networkidle')
        page.evaluate("async()=>{window.fixtureHand=(await import('/tests/fixtures/gesture-hand.js')).hand;}")
        page.locator('#camera-toggle').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'")
        assert not page.locator('#learn-preview').is_visible()
    def enter():
        if page.locator('#learn-enter').is_visible():page.locator('#learn-enter').click()
    page.goto('http://127.0.0.1:5179');setup()
    enter()
    page.locator('#learn-run-trigger').select_option('motion')
    page.locator('#learn-action').select_option('run');page.locator('#learn-record').click()
    page.wait_for_function("window.__NM_DIAGNOSTICS__().studio.captureState==='review'",timeout=12000)
    page.wait_for_function("!document.querySelector('#learn-save').disabled")
    page.locator('.gesture-studio').screenshot(path=str(OUT/'review.png'))
    page.locator('#learn-save').click();page.locator('#learn-exit').click()
    assert page.locator('#learn-mode').input_value()=='hybrid'
    page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='run'",timeout=7000)
    diag=page.evaluate('window.__NM_DIAGNOSTICS__()')
    assert diag['gesture']['action']=='idle','Must be learned, not the original rule'
    assert len(diag['studio']['samples'])==1
    page.locator('.gesture-studio').screenshot(path=str(OUT/'bound.png'))
    enter()
    page.evaluate('window.still=true');page.locator('#learn-action').select_option('idle');page.locator('#learn-record').click()
    page.wait_for_function("window.__NM_DIAGNOSTICS__().studio.captureState==='review'",timeout=12000)
    page.wait_for_function("!document.querySelector('#learn-save').disabled");page.locator('#learn-save').click();page.locator('#learn-exit').click()
    page.wait_for_function('window.__NM_DIAGNOSTICS__().studio.samples.length===2')
    page.evaluate('window.still=false');page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='run'",timeout=7000)
    page.evaluate('window.still=true');page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='idle'",timeout=7000)
    page.evaluate('window.still=false')
    enter()
    with page.expect_download() as download:page.locator('#learn-export').click()
    download.value.save_as(str(OUT/'synthetic-samples.json'))
    exported=json.loads((OUT/'synthetic-samples.json').read_text());assert exported['samples'][0]['action']=='run'
    page.reload();setup()
    assert len(page.evaluate('window.__NM_DIAGNOSTICS__().studio.samples'))==2
    assert page.locator('#learn-mode').input_value()=='hybrid'
    saved=page.evaluate("localStorage.getItem('nm-personal-gestures-v1')")
    page.evaluate("window.handKind='pinch';window.still=true")
    page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='load'",timeout=7000)
    assert page.evaluate('window.__NM_DIAGNOSTICS__().studio.effective.source')=='rules'
    page.locator('#learn-mode').select_option('personal')
    page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='idle'",timeout=7000)
    page.locator('#learn-mode').select_option('rules')
    page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='load'",timeout=7000)
    page.locator('#learn-mode').select_option('hybrid')
    assert page.evaluate("localStorage.getItem('nm-personal-gestures-v1')")==saved
    page.evaluate("window.handKind='open';window.still=false")
    page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='run'",timeout=7000)
    enter()
    page.locator('#learn-import').set_input_files(str(OUT/'synthetic-samples.json'))
    page.wait_for_function("document.querySelector('#learn-status').textContent.includes('已导入')")
    assert len(page.evaluate('window.__NM_DIAGNOSTICS__().studio.samples'))==2
    page.locator('#learn-record').click();page.evaluate('window.noHand=true')
    page.wait_for_function("window.__NM_DIAGNOSTICS__().studio.captureState==='error'",timeout=16000)
    page.wait_for_function("document.querySelector('#learn-save').disabled && document.querySelector('#learn-status').textContent.includes('手部')")
    assert '手部' in page.locator('#learn-status').inner_text()
    page.evaluate('window.noHand=false');page.wait_for_function("!document.querySelector('#learn-record').disabled")
    page.locator('#learn-record').click();page.locator('#camera-toggle').click()
    assert page.evaluate('window.__NM_DIAGNOSTICS__().studio.captureState')=='idle'
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.gesture-studio').screenshot(path=str(OUT/'mobile.png'))
    assert not errors,errors
    result={'kind':'synthetic hand, fake camera; not human recognition accuracy','captureReviewBind':'passed','learnedActionWithoutOldRule':'passed','neutralAndDynamicSamples':'passed','reloadPersistence':'passed','hybridOriginalUnboundAction':'passed','modeSwitchPreservesSamples':'passed','exportImport':'passed','lostHandRejected':'passed','cameraStopCancelsCapture':'passed','mobile':'passed','errors':errors}
    (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result));browser.close()
