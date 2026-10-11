"""Exercise control/record exclusivity with synthetic landmarks, never the user's camera."""
from playwright.sync_api import sync_playwright
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1100});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''
      window.paints={stage:0,'learn-preview':0};window.workerCount=0;
      const draw=CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id in paints)paints[this.canvas.id]++;return draw.apply(this,args);};
      window.Worker=class {
        constructor(){workerCount++;}
        postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
        if(d.type==='frame'){
          d.bitmap.close();const points=window.fixtureHand?fixtureHand(window.handKind||'run',{
            middleBend:window.moving?.5+.5*Math.sin(performance.now()/650*Math.PI*2):.5,
            x:window.wholeMoving?.1*Math.sin(performance.now()/150):0
          }):null;
          queueMicrotask(()=>this.onmessage?.({data:{type:'result',timestamp:d.timestamp,inferenceMs:0,landmarks:points}}));
        }}
        terminate(){this.onmessage=null;}
      };''')
    page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle')
    assert page.locator('#main-view').is_visible() and not page.locator('#learn-preview').is_visible()
    page.evaluate("async()=>{window.fixtureHand=(await import('/tests/fixtures/gesture-hand.js')).hand;}")
    page.locator('#start-camera').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().mode==='camera'")
    page.wait_for_function("document.querySelector('#run-rule-status').textContent.includes('中间三指')")
    assert page.evaluate("__NM_DIAGNOSTICS__().action")=='idle'
    page.evaluate('window.wholeMoving=true');page.wait_for_timeout(900)
    assert page.evaluate("__NM_DIAGNOSTICS__().action")=='idle'
    page.evaluate('window.wholeMoving=false;window.moving=true')
    page.wait_for_function("__NM_DIAGNOSTICS__().action==='run'")
    assert page.evaluate("paints['learn-preview']")==0
    page.evaluate('window.moving=false');page.wait_for_function("__NM_DIAGNOSTICS__().action==='idle'",timeout=1000)
    page.evaluate('window.moving=true');page.wait_for_function("__NM_DIAGNOSTICS__().action==='run'")
    page.locator('#learn-enter').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().action==='idle'")
    assert not page.locator('#main-view').is_visible() and page.locator('#learn-preview').is_visible()
    before=page.evaluate('({...paints})');page.wait_for_timeout(400);after=page.evaluate('({...paints})')
    assert after['stage']==before['stage'] and after['learn-preview']>before['learn-preview'],(before,after,errors,page.evaluate('__NM_DIAGNOSTICS__()'))
    assert page.evaluate("__NM_DIAGNOSTICS__().gesture.action")=='idle'
    assert page.evaluate("__NM_DIAGNOSTICS__().studio.captureFrames")==0
    assert page.locator('[data-action=run]').is_disabled()
    page.locator('#learn-duration').select_option('4000');page.locator('#learn-record').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().studio.captureState==='review'",timeout=11000)
    assert page.evaluate("__NM_DIAGNOSTICS__().action")=='idle'
    page.locator('#learn-save').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().studio.samples.length===1")
    assert page.evaluate("__NM_DIAGNOSTICS__().action")=='idle'
    page.locator('#learn-exit').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().action==='run'")
    before=page.evaluate('({...paints})');page.wait_for_timeout(400);after=page.evaluate('({...paints})')
    assert after['learn-preview']==before['learn-preview'] and after['stage']>before['stage']
    page.locator('#learn-enter').click();page.locator('#learn-record').click();page.locator('#learn-exit').click()
    assert page.evaluate("__NM_DIAGNOSTICS__().studio.captureState")=='idle'
    assert len(page.evaluate("__NM_DIAGNOSTICS__().studio.samples"))==1
    page.locator('#learn-mode').select_option('personal')
    page.locator('#learn-enter').click();page.locator('#learn-library button').first.click()
    assert page.locator('#learn-mode').input_value()=='rules'
    page.locator('#learn-exit').click();page.wait_for_function("__NM_DIAGNOSTICS__().action==='run'")
    assert page.evaluate('workerCount')==1,'All workspaces share one camera/tracker'
    page.locator('#camera-toggle').click();page.wait_for_function("__NM_DIAGNOSTICS__().mode==='off'")
    page.screenshot(path='/private/tmp/neural-marionette-control-off.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#learn-enter').click()
    assert page.locator('#learn-exit').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/private/tmp/neural-marionette-record-off.png',full_page=True)
    assert not errors,errors
    print('PASS: built-in three-finger motion and stop; exclusive preview/render/control; capture/save/return; cancel preserves samples; empty library restores rules; one worker; mobile; no page errors. Synthetic input only.')
    browser.close()
