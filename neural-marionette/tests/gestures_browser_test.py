"""Replay synthetic landmarks through the app worker interface, not model accuracy testing."""
import json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1280,'height':1000})
    page.add_init_script('''window.Worker=class {
      postMessage(d){if(d.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));
      if(d.type==='frame'){d.bitmap.close();queueMicrotask(()=>this.onmessage?.({data:{type:'result',timestamp:d.timestamp,inferenceMs:0,landmarks:window.fixturePoints||null}}));}}
      terminate(){this.onmessage=null;}
    };''')
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    page.evaluate("async()=>{window.fixtureHand=(await import('/tests/fixtures/gesture-hand.js')).hand;window.fixturePoints=fixtureHand('open');}")
    page.locator('#start-camera').click()
    page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated',timeout=10000)
    async_trace='''async({kind,duration,from,to})=>{
      const start=performance.now();const seen=new Set();
      await new Promise(resolve=>{function step(now){const f=Math.min(1,(now-start)/duration),o={};for(const k of Object.keys(to))o[k]=(from[k]||0)+(to[k]-(from[k]||0))*f;
      window.fixturePoints=fixtureHand(kind,o);seen.add(window.__NM_DIAGNOSTICS__().action);if(f<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});return [...seen];
    }'''
    def trace(kind,duration=600,frm=None,to=None):return page.evaluate(async_trace,{'kind':kind,'duration':duration,'from':frm or {},'to':to or {}})
    results={}
    assert '朝下' in page.locator('[data-action=run]').inner_text()
    assert '只伸出食指' in page.locator('[data-action=turn]').inner_text()
    for kind in ['two','one']:
        trace('open',400)
        seen=trace(kind,650,{}, {'x':.20})
        assert 'run' not in seen and 'turn' not in seen,(kind,seen)
    trace('open',400)
    seen=trace('twoDown',650,{}, {'angle':.7,'y':.10})
    assert 'turn' not in seen,seen
    trace('open',700)
    for kind,expected,frm,to in [('twoDown','run',{}, {'y':.15}),('one','turn',{'x':.20},{'x':.20,'angle':1.1}),('pinch','load',{},{}),('fist','crouch',{}, {'y':.10})]:
        trace('open',400)
        seen=trace(kind,600,frm,to)
        assert expected in seen,(expected,seen,page.evaluate('window.__NM_DIAGNOSTICS__()'))
        results[expected]=seen
    seen=trace('open',250,{'y':.10},{'y':-.12});page.wait_for_timeout(80)
    assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='jump',(seen,page.evaluate('window.__NM_DIAGNOSTICS__()'))
    page.wait_for_timeout(1800);assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='idle'
    trace('pinch',500);assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='load'
    page.evaluate('window.fixturePoints=null');page.wait_for_timeout(700)
    assert page.evaluate('window.__NM_DIAGNOSTICS__().action')=='idle'
    results.update(jump='completed once',lost_hand='returned to idle',kind='synthetic landmark replay with fake camera; NOT human recognition accuracy')
    (ROOT/'docs/evidence/gesture-separation').mkdir(parents=True,exist_ok=True)
    page.locator('#camera-toggle').click()
    page.locator('.choreography').screenshot(path=str(ROOT/'docs/evidence/gesture-separation/instructions.png'))
    (ROOT/'docs/evidence/gesture-separation/results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results));browser.close()
