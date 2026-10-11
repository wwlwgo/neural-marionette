"""Real audio decode/output graph plus stage lifecycle; camera is synthetic."""
import json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'docs/evidence/music';OUT.mkdir(parents=True,exist_ok=True)
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''window.Worker=class {
      postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
      if(d.type==='frame'){d.bitmap.close();queueMicrotask(()=>this.onmessage?.({data:{type:'result',timestamp:d.timestamp,inferenceMs:0,landmarks:null}}));}}
      terminate(){this.onmessage=null;}
    };''')
    page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle')
    assert page.evaluate('window.__NM_DIAGNOSTICS__().music.state')=='uninitialized'
    # Camera initiation creates/resumes audio within the same click.
    page.locator('#start-camera').click()
    page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera' && window.__NM_DIAGNOSTICS__().music.rms>.001",timeout=15000)
    music=page.evaluate('window.__NM_DIAGNOSTICS__().music');assert music['loop'] and abs(music['duration']-76.8)<.1
    page.locator('#camera-toggle').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().music.state==='suspended'")
    # Explicit standalone preview, smooth volume adjustment, and persisted mute.
    page.locator('#music-toggle').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms>.001')
    page.locator('#music-volume').fill('0');page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms<.00001')
    page.locator('#music-volume').fill('37');page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms>.001')
    page.locator('#music-toggle').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().music.state==='suspended'")
    page.reload();page.wait_for_load_state('networkidle')
    assert page.locator('#music-volume').input_value()=='37'
    page.locator('#start-demo').click();page.wait_for_timeout(250)
    assert not page.evaluate('window.__NM_DIAGNOSTICS__().music.playing')
    page.locator('#music-toggle').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms>.001')
    page.locator('[data-action="run"]').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().action==='run'")
    assert page.evaluate('window.__NM_DIAGNOSTICS__().music.playing')
    # Dispatch visibility transitions deterministically; no actual camera data involved.
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function("window.__NM_DIAGNOSTICS__().music.state==='suspended'")
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms>.001')
    page.locator('#music-panel').screenshot(path=str(OUT/'controls-desktop.png'))
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#music-panel').screenshot(path=str(OUT/'controls-mobile.png'))
    page.locator('#demo-toggle').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().music.state==='suspended'")
    # A failed asset is recoverable and doesn't prevent the stage from running.
    page.reload();page.wait_for_load_state('networkidle')
    page.route('**/music/neon-orbit.mp3',lambda route:route.fulfill(status=503,body='Unavailable'))
    page.locator('#start-demo').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().music.error!==''")
    assert page.evaluate('window.__NM_DIAGNOSTICS__().mode')=='demo'
    page.unroute('**/music/neon-orbit.mp3');page.locator('#music-toggle').click()
    page.wait_for_function('window.__NM_DIAGNOSTICS__().music.rms>.001')
    assert not errors,errors
    result={'kind':'headless real AudioContext decode and signal checks; synthetic camera; not subjective listening','initiallySilent':True,'cameraAutoStartStop':True,'decodedDuration':music['duration'],'loopEnabled':music['loop'],'audibleSignalRms':music['rms'],'zeroVolume':True,'preferencesPersist':True,'disabledSurvivesReload':True,'actionSwitchKeepsMusic':True,'backgroundPauseResume':True,'demoStopSuspends':True,'mobileNoOverflow':True,'failedAssetRetry':True,'errors':errors}
    (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result));browser.close()
