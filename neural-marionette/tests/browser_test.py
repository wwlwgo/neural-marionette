import json, pathlib, time, os
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/evidence'
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 context=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
 page.wait_for_function('window.__NM_DIAGNOSTICS__ && window.__NM_DIAGNOSTICS__().frames > 20')
 page.screenshot(path=str(OUT/'01-idle.png'),full_page=True)
 page.locator('#start-demo').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated')
 before=page.evaluate('window.__NM_DIAGNOSTICS__()')
 page.mouse.move(450,570);page.wait_for_timeout(600)
 after=page.evaluate('window.__NM_DIAGNOSTICS__()');assert before['pose']!=after['pose'];assert after['points']==21
 page.locator('#gain').fill('1.5');assert page.locator('#gain-value').inner_text()=='1.5×'
 page.locator('#debug-toggle').click();page.get_by_label('左臂',exact=True).fill('25');page.wait_for_timeout(600)
 assert abs(page.evaluate('window.__NM_DIAGNOSTICS__().pose.left')-25*3.141592653589793/180)<.02
 page.locator('#reset').click();page.locator('#debug-toggle').click()
 page.screenshot(path=str(OUT/'02-linked-simulation.png'),full_page=True)
 page.locator('#quality').select_option('low');assert page.locator('#stage').evaluate('(c)=>c.width')==1280
 page.locator('#quality').select_option('medium')
 page.locator('#record').click();page.wait_for_timeout(1500)
 with page.expect_download() as download_info:page.locator('#record').click()
 download_info.value.save_as(str(OUT/'recording-smoke-SIMULATION.webm'))
 page.locator('#camera-toggle').click()
 page.wait_for_function("['camera','error'].includes(window.__NM_DIAGNOSTICS__().mode)",timeout=35000)
 camera=page.evaluate('window.__NM_DIAGNOSTICS__()')
 page.wait_for_timeout(3000)
 camera=page.evaluate('window.__NM_DIAGNOSTICS__()');assert camera['mode']=='camera',camera
 assert camera['workerReady'];assert camera['points']==0
 page.screenshot(path=str(OUT/'03-fake-camera-no-hand.png'),full_page=True)
 page.locator('#camera-toggle').click()
 assert page.evaluate("document.querySelector('#camera').srcObject===null")
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(400);page.screenshot(path=str(OUT/'04-mobile.png'),full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.set_viewport_size({'width':1440,'height':1100})
 page.route('**/models/hand_landmarker.task',lambda route:route.abort())
 page.locator('#start-camera').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='error'",timeout=35000)
 missing_model=page.evaluate('window.__NM_DIAGNOSTICS__()')
 page.screenshot(path=str(OUT/'05-model-error.png'),full_page=True)
 assert page.locator('#notice').is_visible()
 result={'test_type':'browser integration with synthetic camera, NOT real camera acceptance','demo':after,'fake_camera':camera,'missing_model':missing_model,'uncaught_errors':errors}
 (OUT/'browser-test.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps(result,ensure_ascii=False,indent=2))
 assert not errors,errors
 browser.close()
