import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


base_url = os.environ.get("OJ_CONSOLE_BROWSER_URL", "http://127.0.0.1:41783")
root = Path(__file__).resolve().parents[1]
source = root / "prototypes" / "oj-console" / "examples" / "demo-source.cpp"
screenshot = root / ".runtime" / "oj-console-browser.png"
screenshot.parent.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    browser_errors = []
    page.on("console", lambda message: browser_errors.append(f"console:{message.type}:{message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: browser_errors.append(f"page:{error}"))
    page.goto(base_url)
    page.wait_for_load_state("networkidle")

    expect(page.locator("#serverStatus")).to_have_text("LOCAL / ONLINE")
    expect(page.locator("#previewButton")).to_be_disabled()
    expect(page).to_have_url(re.compile(r"^http://127\.0\.0\.1:\d+/$"))
    assert page.locator("body").get_attribute("data-session-token") is None

    page.locator("[data-mode='real']").click()
    expect(page.locator("#realGate")).to_be_visible()
    expect(page.locator("#unlockCopy")).to_have_text("我确认本次操作可能向在线评测平台真实提交代码")
    expect(page.locator("#previewButton")).to_be_disabled()
    page.locator("[data-mode='demo']").click()

    page.locator("#targetPlatform").select_option("atcoder")
    expect(page.locator("#problemUrl")).to_have_value("https://atcoder.jp/contests/abc350/tasks/abc350_a")
    expect(page.locator("#handleField")).to_be_hidden()
    expect(page.locator("#loginButton")).to_have_text("登录 AtCoder")

    page.locator("#fileInput").set_input_files(str(source))
    expect(page.locator("#sourceTicket")).to_be_visible()
    expect(page.locator("#sourceDigest")).to_contain_text(re.compile(r"[a-f0-9]{12}"))
    expect(page.locator("#previewButton")).to_be_enabled()

    page.locator("#previewButton").click()
    expect(page.locator("#previewCard")).to_be_visible()
    expect(page.locator("#previewMode")).to_have_text("DEMO")
    expect(page.locator("#previewTarget")).to_have_text("https://atcoder.jp/contests/abc350/tasks/abc350_a")
    expect(page.locator("#previewHandle")).to_have_text("SUBMISSION LINK ONLY")
    expect(page.locator("#previewDigest")).to_have_text(re.compile(r"^[a-f0-9]{12}$"))

    page.locator("#confirmButton").click()
    expect(page.locator("#resultState")).to_have_text("ACCEPTED", timeout=15_000)
    expect(page.locator("#resultCode")).to_have_text("AC")
    expect(page.locator("#confirmButton")).to_be_disabled()
    expect(page.locator("#confirmButton")).to_have_text("确认已使用")
    page.screenshot(path=str(screenshot), full_page=True)

    if browser_errors:
        raise AssertionError("\n".join(browser_errors))
    browser.close()

print(f"OJ console browser flow passed: {screenshot}")
