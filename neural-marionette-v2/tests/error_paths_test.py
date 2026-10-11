import json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 results=[]
 for error in ['NotAllowedError','NotFoundError','NotReadableError']:
  page=browser.new_page()
  page.add_init_script(f"navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('test injected camera error','{error}'))")
  page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle');page.locator('#start-camera').click()
  page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='error'")
  assert page.evaluate("document.querySelector('#camera').srcObject===null")
  results.append({'injected_error':error,'notice':page.locator('#notice').inner_text()});page.close()
 page=browser.new_page();page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle');page.locator('#start-camera').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000)
 page.evaluate("document.querySelector('#camera').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended'))")
 page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='error'");results.append({'injected_error':'track ended','notice':page.locator('#notice').inner_text()})
 page.locator('#start-demo').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated');results.append({'recovery':'demo after camera error','state':page.evaluate('window.__NM_DIAGNOSTICS__().state')})
 (ROOT/'docs/evidence/error-paths-test.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2));browser.close()
