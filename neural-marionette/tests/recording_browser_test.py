"""Recording lifecycle and real encoding; fake camera + synthetic landmarks, NOT human acceptance.
Run with a local server: PYTHONPATH=.test-python python3 tests/recording_browser_test.py
"""
import json, os, pathlib, statistics, subprocess
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('EVIDENCE_DIR','docs/evidence/recording');OUT.mkdir(parents=True,exist_ok=True)
MEDIA=pathlib.Path('/private/tmp/nm-recording-regression');MEDIA.mkdir(exist_ok=True)
CHROME=os.environ.get('CHROME_PATH','/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''
      window.__tracks=[];const capture=HTMLCanvasElement.prototype.captureStream;
      HTMLCanvasElement.prototype.captureStream=function(fps){const stream=capture.call(this,fps);window.__tracks.push(...stream.getTracks());if(window.__automaticOnly)stream.getVideoTracks()[0].requestFrame=undefined;return stream;};
      window.__NativeRecorder=MediaRecorder;
      const NativeWorker=Worker;
      window.Worker=class extends NativeWorker{
        set onmessage(callback){super.onmessage=event=>{if(event.data.type==='result'&&window.__hand)event.data.landmarks=window.__hand;callback(event);};}
      };
    ''')
    page.goto(os.environ.get('TEST_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
    assert page.locator('#capture-optimize').count()==1
    page.locator('#quality').select_option('high')
    page.locator('#start-camera').click()
    page.wait_for_function("window.__NM_DIAGNOSTICS__().mode==='camera'",timeout=35000)
    page.evaluate("async()=>{const {syntheticHand}=await import('/src/core.js');window.__hand=syntheticHand(2,{x:.5,y:.5});}")
    page.wait_for_function('window.__NM_DIAGNOSTICS__().calibrated',timeout=10000)
    with page.expect_download(timeout=40000) as download:
        page.locator('#record').click()
        assert page.locator('#capture-optimize').is_checked()
        assert page.locator('#capture-optimize').is_disabled()
        samples=[]
        for i in range(23):
            page.wait_for_timeout(1000);samples.append(page.evaluate('window.__NM_DIAGNOSTICS__()'))
            if i==10:page.locator('.workspace').screenshot(path=str(OUT/'recording.png'))
    path=MEDIA/download.value.suggested_filename;download.value.save_as(str(path))
    assert 'LIVE' in path.name
    assert all(s['renderProfile']['width']==1280 and s['points']==21 and s['workerReady'] for s in samples)
    assert all(s['samples'][-1]['trackingHz']>5 for s in samples)
    assert page.evaluate("document.querySelector('#stage').width") == 1920
    assert page.locator('#quality').input_value()=='high' and page.locator('#quality').is_enabled()
    assert not page.locator('#capture-optimize').is_checked()
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended')")
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames:format=duration,size','-of','json',str(path)]))
    video=probe['streams'][0];assert (video['width'],video['height'])==(1280,720)
    frames=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(path)]))['frames']
    times=[float(f['best_effort_timestamp_time']) for f in frames]
    duration=times[-1]-times[0];fps=(len(times)-1)/duration;gap=max(b-a for a,b in zip(times,times[1:]))
    assert 24<duration<27 and fps>27 and gap<.3,(duration,fps,gap)
    subprocess.run(['ffmpeg','-v','error','-ss','10','-i',str(path),'-frames:v','1','-y',str(OUT/'decoded-frame.png')],check=True)
    summary={'kind':'real local model on fake camera; synthetic 21 landmarks for overlay load; not real-hand or macOS recorder validation',
             'fullRecording':{'codec':video['codec_name'],'duration':duration,'decodedFps':fps,'frames':len(times),'maxFrameGapMs':gap*1000,'bytes':int(probe['format']['size'])},
             'renderAverageFps':statistics.mean(s['samples'][-1]['fps'] for s in samples[2:]),
             'trackingAverageHz':statistics.mean(s['samples'][-1]['trackingHz'] for s in samples[2:]),'samples':samples[2:]}
    # Manual mode survives built-in recording, and restores the user's high preset when unchecked.
    page.locator('#capture-optimize').check();page.locator('#record').click();page.wait_for_timeout(700)
    with page.expect_download() as d:page.locator('#record').click()
    assert page.locator('#capture-optimize').is_checked() and page.locator('#capture-optimize').is_enabled()
    assert page.evaluate("document.querySelector('#stage').width")==1280
    page.locator('#capture-optimize').uncheck()
    assert page.evaluate("document.querySelector('#stage').width")==1920
    # Mode exit finalizes the live recording and releases all owned capture tracks.
    page.locator('#record').click();page.wait_for_timeout(700)
    with page.expect_download() as d:page.locator('#camera-toggle').click()
    assert 'LIVE' in d.value.suggested_filename
    page.wait_for_function("window.__NM_DIAGNOSTICS__().recording.state==='inactive'")
    assert page.locator('#record').is_disabled()
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended') && document.querySelector('#camera').srcObject===null")
    page.locator('#start-demo').click()
    # Unsupported runtime encoder despite positive capability checks: no leaked tracks or locked UI.
    page.evaluate("()=>{window.MediaRecorder=class {static isTypeSupported(){return true;} constructor(){throw new Error('test encoder unavailable');}};}")
    page.locator('#record').click()
    assert '编码器' in page.locator('#notice').inner_text()
    assert page.locator('#quality').is_enabled() and not page.locator('#capture-optimize').is_checked()
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended')")
    # Fallback to VP8 and timed capture in a browser without requestFrame.
    page.evaluate("()=>{window.__automaticOnly=true;window.MediaRecorder=class extends window.__NativeRecorder{static isTypeSupported(t){return t.includes('vp8')&&window.__NativeRecorder.isTypeSupported(t);}};}")
    page.locator('#record').click();page.wait_for_timeout(1300)
    diag=page.evaluate('window.__NM_DIAGNOSTICS__().recording')
    assert 'vp8' in diag['mimeType'] and not diag['manualCapture']
    with page.expect_download() as d:page.locator('#record').click()
    assert d.value.suggested_filename.endswith('.webm')
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended')")
    # Asynchronous encoder errors stop capture, preserve available data, and unlock controls.
    page.evaluate("()=>{window.__automaticOnly=false;window.MediaRecorder=class extends window.__NativeRecorder{constructor(...args){super(...args);window.__testRecorder=this;}};}")
    page.locator('#record').click();page.wait_for_timeout(1200)
    with page.expect_download() as d:page.evaluate("window.__testRecorder.onerror({error:new Error('test encoder stopped')})")
    assert 'test encoder stopped' in page.locator('#notice').inner_text()
    assert page.locator('#quality').is_enabled() and page.locator('#record').is_enabled()
    assert page.evaluate("window.__tracks.every(t=>t.readyState==='ended')")
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('.capture-controls').screenshot(path=str(OUT/'mobile-controls.png'))
    assert not errors,errors
    summary.update({'manualModeRestored':True,'qualityRestored':True,'earlyStopAndModeExit':True,'failedStartCleanup':True,'vp8TimedCaptureFallback':True,'asyncErrorCleanup':True,'mobileNoOverflow':True,'uncaughtErrors':errors})
    (OUT/'results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k!='samples'},ensure_ascii=False));browser.close()
