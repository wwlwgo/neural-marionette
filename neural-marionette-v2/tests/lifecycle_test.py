import json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 page=browser.new_page(accept_downloads=True);page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle');page.locator('#start-demo').click();page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated');page.locator('#record').click();page.wait_for_timeout(1000)
 with page.expect_download() as d:page.locator('#camera-toggle').click()
 assert 'SIMULATION' in d.value.suggested_filename
 page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000)
 assert not page.locator('#record').evaluate("e=>e.classList.contains('recording')")
 page.close();page=browser.new_page()
 page.add_init_script('''const RealWorker=window.Worker;window.Worker=class extends RealWorker {set onmessage(handler){super.onmessage=event=>{if(event.data.type==='result')event.data.timestamp-=2000;handler(event);};}};''')
 page.goto('http://127.0.0.1:5179');page.wait_for_load_state('networkidle');page.locator('#start-camera').click();page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000);page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='error'",timeout=10000)
 diag=page.evaluate('window.__NM_DIAGNOSTICS__()');assert diag['points']==0;assert '停止更新' in page.locator('#notice').inner_text()
 result={'recording_source_switch':'PASS: camera switch stops SIMULATION recording','stale_results':'PASS: 2-second-old worker results rejected, timeout releases camera','diag':diag}
 (ROOT/'docs/evidence/lifecycle-test.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));browser.close()
