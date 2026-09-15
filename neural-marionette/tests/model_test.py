import json,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal'])
 page=browser.new_page();page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
 page.route('**/official-test-image.jpg',lambda r:r.fulfill(body=(ROOT/'tests/fixtures/right_hands.jpg').read_bytes(),content_type='image/jpeg'))
 result=page.evaluate('''async()=>{
  const config=(await import('/config/app_config.json')).default;
  const response=await fetch('/official-test-image.jpg');const image=await createImageBitmap(await response.blob());
  return await new Promise((resolve,reject)=>{const worker=new Worker('/tracker.worker.js');const timeout=setTimeout(()=>{worker.terminate();reject('worker timeout');},25000);
   worker.onerror=e=>reject(e.message);
   worker.onmessage=({data})=>{if(data.type==='ready')worker.postMessage({type:'frame',bitmap:image,timestamp:performance.now()},[image]);if(data.type==='result'){clearTimeout(timeout);worker.terminate();resolve(data);}if(data.type==='error'){clearTimeout(timeout);worker.terminate();reject(data.message);}};
   worker.postMessage({type:'init',config:config.tracking});
  });
 }''')
 assert len(result['landmarks'])==21,result
 result['evidence_type']='Official static right_hands.jpg through actual production Worker; not live camera'
 (ROOT/'docs/evidence/model-test.json').write_text(json.dumps(result,indent=2))
 print(json.dumps({'points':len(result['landmarks']),'handedness':result['handedness'],'inferenceMs':result['inferenceMs'],'wrist':result['landmarks'][0],'index_tip':result['landmarks'][8]},indent=2))
 browser.close()
