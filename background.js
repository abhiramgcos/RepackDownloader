chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    request.links.forEach((url, index) => {
      setTimeout(() => {
        chrome.tabs.create({ url: url, active: false }, (tab) => {
          const tabId = tab.id;
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: waitAndClickDownload
          }).catch(() => {});
        });
      }, index * 5000);
    });
  }
});

function waitAndClickDownload() {
  const start = Date.now();
  const maxWait = 180000;

  function safeClick(el) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  function waitFor(predicate, callback, delayMs = 0) {
    const interval = setInterval(() => {
      const el = predicate();
      if (el) {
        clearInterval(interval);
        setTimeout(() => callback(el), delayMs);
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
      }
    }, 500);
  }

  function findButtonBySpanText(text) {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const span = b.querySelector('span');
      if (span && span.textContent.trim().startsWith(text)) {
        return b;
      }
    }
    return null;
  }

  // Step 1: Click "Continue to Download"
  waitFor(() => document.querySelector('#method_free'), (btn) => {
    safeClick(btn);

    // Step 2: Wait 3s for the page to load download sections, then click "Free Download"
    waitFor(() => findButtonBySpanText('Free Download'), (btn2) => {
      safeClick(btn2);

      // Step 3: Wait for "Start Download" button and click it
      waitFor(() => findButtonBySpanText('Start Download'), (btn3) => {
        safeClick(btn3);
      }, 1000);
    }, 3000);
  });
}
