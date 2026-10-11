"""Actual GLB, synthetic tracker, and a camera-off deliverable image."""
import json,os,pathlib,tempfile
from playwright.sync_api import sync_playwright
OUT=pathlib.Path(tempfile.gettempdir())/'neural-marionette-v2-tests/model';OUT.mkdir(parents=True,exist_ok=True)
CHROME=os.environ.get('NM_TEST_CHROME','/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1100});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''window.Worker=class {
      postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
      if(d.type==='frame'){d.bitmap.close();let points=null;
       if(window.fixtureHand){points=fixtureHand('run',{middleBend:window.moving?.5+.5*Math.sin(performance.now()/120):.5});
        if(window.anchorNoise)points[9].z+=.02*Math.sin(performance.now()/130);}
       queueMicrotask(()=>this.onmessage?.({data:{type:'result',timestamp:d.timestamp,inferenceMs:0,landmarks:points}}));}}
      terminate(){this.onmessage=null;}
    };''')
    page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle')
    page.wait_for_function("__NM_DIAGNOSTICS__().character.triangles===100754")
    assert 'V2' in page.title()
    assert page.evaluate('__NM_DIAGNOSTICS__().mode')=='off'
    assert page.evaluate('__NM_DIAGNOSTICS__().character.bones.length')==15
    page.screenshot(path=str(OUT/'v2-camera-off.png'),full_page=True)
    for action in ['run','load','crouch','turn','jump','idle']:
        page.locator('[data-action='+action+']').click()
        page.wait_for_function("a=>__NM_DIAGNOSTICS__().action===a",arg=action)
        page.wait_for_timeout(220)
        d=page.evaluate('__NM_DIAGNOSTICS__()')
        assert d['renderer']['triangles']>=100754
        assert all(all(isinstance(foot[k],(float,int)) and abs(foot[k])<100 for k in ['x','y','z']) for foot in d['feet'])
        if action in ['turn','jump']:
            page.locator('[data-action=idle]').click()
            page.wait_for_function("__NM_DIAGNOSTICS__().action==='idle'")
    page.locator('#character-restore').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().character.type==='original'")
    page.locator('#character-guardian').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().character.triangles===100754")
    page.locator('summary').filter(has_text='查看模型检查结果').click()
    assert page.locator('#character-report').is_visible()
    page.evaluate("async()=>{window.fixtureHand=(await import('/tests/fixtures/gesture-hand.js')).hand;window.anchorNoise=true;}")
    page.locator('#gesture-control').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().mode==='camera'")
    for _ in range(10):
        page.wait_for_timeout(120)
        assert page.evaluate('__NM_DIAGNOSTICS__().action')=='idle'
    page.evaluate('window.anchorNoise=false;window.moving=true')
    page.wait_for_function("__NM_DIAGNOSTICS__().action==='run'")
    page.evaluate('window.moving=false;window.anchorNoise=true')
    page.wait_for_function("__NM_DIAGNOSTICS__().action==='idle'",timeout=1200)
    page.locator('#camera-toggle').click()
    page.wait_for_function("__NM_DIAGNOSTICS__().mode==='off'")
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    result={'model':'real guardian GLB, 100754 triangles, 15 bones','sixActions':'passed','switchOriginalAndGuardian':'passed','anchorNoiseRejected':'passed','realFingerMotion':'synthetic fixture passed','stopWithNoise':'passed','mobile':'passed','pageErrors':errors,'evidence':str(OUT/'v2-camera-off.png')}
    (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));browser.close()
