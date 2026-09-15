"""Capture UI-driven SIMULATION demonstration. No real camera input."""
import pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
CHROME='/Users/wwl/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROME,headless=True,args=['--use-angle=metal'])
    page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
    page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
    page.locator('[data-action="idle"]').click();page.wait_for_timeout(900)
    page.locator('#record').click()
    for action,duration in [('idle',1400),('run',3400),('turn',2600),('load',3300),('crouch',2200),('jump',1800),('idle',1200)]:
        page.locator('[data-action="'+action+'"]').click();page.wait_for_timeout(duration)
    with page.expect_download() as download:page.locator('#record').click()
    destination=ROOT/'recordings/actions-v3-SIMULATION.webm'
    download.value.save_as(str(destination));print(destination);browser.close()
