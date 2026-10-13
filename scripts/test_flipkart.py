from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    print("goto seller.flipkart")
    page.goto("https://seller.flipkart.com/index.html#dashboard/home-page", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    print("title", page.title())
    print("url", page.url)
    # try to find Reports
    try:
        print("content", page.content()[:2000])
        # screenshot
        page.screenshot(path="flipkart_home.png", full_page=True)
        print("screenshot saved")
    except Exception as e:
        print(e)
    browser.close()
