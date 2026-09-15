"""Wall-clock soak of real renderer + real ML worker on test camera, not live-hand acceptance."""
import json,pathlib,time,math
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=ROOT/'docs/evidence'
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle');page.locator('#start-demo').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated')
 with page.expect_download(timeout=45000) as video:
  page.locator('#record').click()
  for i in range(25):
   page.mouse.move(330+120*math.sin(i*.5),660+90*math.cos(i*.4));page.wait_for_timeout(1000)
 video.value.save_as(str(ROOT/'recordings/preview-SIMULATION-25s.webm'))
 page.locator('#camera-toggle').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000)
 begin=time.monotonic();samples=[]
 for i in range(60):
  page.wait_for_timeout(10000);d=page.evaluate('window.__NM_DIAGNOSTICS__()');samples.append({'elapsed':time.monotonic()-begin,**d})
  assert d['mode']=='camera' and d['workerReady'] and not d['errors'],d
  if i%6==5:print(json.dumps({'elapsed':round(time.monotonic()-begin),'fps':d['samples'][-1]['fps'],'inference':d['samples'][-1]['inferenceMs']}),flush=True)
 page.screenshot(path=str(OUT/'06-soak-test-camera.png'),full_page=True)
 with page.expect_download() as diag:page.locator('#export').click()
 diag.value.save_as(str(OUT/'soak-diagnostics.json'))
 result={'kind':'600 seconds wall-clock, synthetic no-hand camera + real MediaPipe inference + real WebGL; NOT live hand','elapsed_seconds':time.monotonic()-begin,'samples':samples,'errors':errors}
 (OUT/'soak-test.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));assert not errors
 browser.close()
 print('SOAK PASS',flush=True)
