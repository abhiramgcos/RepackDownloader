function saveToStorage(entry) {
  chrome.storage.session.get(['progressLog'], (data) => {
    const log = data.progressLog || [];
    log.push(entry);
    chrome.storage.session.set({ progressLog: log });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    console.log('[BG] Received download request for', request.links.length, 'links');
    chrome.storage.session.set({ progressLog: [], downloadDone: false });

    const total = request.links.length;
    saveToStorage({ type: 'info', text: `Queued ${total} link(s).` });

    request.links.forEach((url, index) => {
      setTimeout(() => {
        console.log(`[BG] Opening tab for: ${url}`);
        saveToStorage({ type: 'progress', text: `Opening ${index + 1}/${total}: ${url}` });

        chrome.tabs.create({ url: url, active: true }, (tab) => {
          console.log(`[BG] Tab ${tab.id} created, waiting for load`);
          const onUpdated = (tabId, info) => {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpdated);
              console.log(`[BG] Tab ${tab.id} loaded, injecting script`);
              saveToStorage({
                type: 'progress',
                text: `Tab ${tab.id} loaded, starting automation.`
              });

              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: waitAndClickDownload
              }).catch((err) => {
                console.error('[BG] Script injection failed:', err);
                saveToStorage({
                  type: 'error',
                  text: `Tab ${tab.id} injection failed: ${err.message || err}`
                });
              });
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
        });
      }, index * 5000);
    });

    setTimeout(() => {
      saveToStorage({ type: 'done', text: `All ${total} downloads queued.` });
      chrome.storage.session.set({ downloadDone: true });
    }, total * 5000 + 2000);
  }

  if (request.action === 'getProgress') {
    chrome.storage.session.get(['progressLog', 'downloadDone'], (data) => {
      sendResponse({ log: data.progressLog || [], done: !!data.downloadDone });
    });
    return true;
  }
});

function waitAndClickDownload() {
  const start = Date.now();
  const maxWait = 180000;
  const log = (...args) => console.log(`[INJECT ${location.href.slice(-40)}]`, ...args);

  log('Script started');

  function safeClick(el) {
    log('Clicking:', el.tagName, el.id || '', el.className?.slice(0, 60));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    el.click();
    log('Clicked dispatched');
  }

  function waitFor(predicate, callback, delayMs = 0) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = predicate();
      if (el) {
        log(`Found target after ${attempts} attempts (${(attempts * 0.5).toFixed(1)}s), delay=${delayMs}ms`);
        clearInterval(interval);
        if (delayMs > 0) {
          setTimeout(() => callback(el), delayMs);
        } else {
          callback(el);
        }
      } else if (Date.now() - start > maxWait) {
        log('TIMEOUT after', attempts, 'attempts');
        clearInterval(interval);
      }
    }, 500);
  }

  function isVisible(el) {
    return !!el && !!el.offsetParent;
  }

  // Step 1: Click "Continue to Download"
  log('Step 1: Waiting for #method_free...');
  waitFor(() => document.querySelector('#method_free'), (btn) => {
    safeClick(btn);
    log('Step 1 done, starting 3s delay before Step 2');

    // Step 2: Wait for "Free Download"
    log('Step 2: Looking for "Free Download" button...');
    log('Button-like count on page:', document.querySelectorAll('button, a, [role="button"]').length);
    document.querySelectorAll('button, a, [role="button"]').forEach((b, i) => {
      const txt = (b.innerText || b.textContent || '').trim().slice(0, 60);
      if (txt.includes('Free') || txt.includes('Download') || txt.includes('Start')) {
        log(`  Candidate ${i}: tag="${b.tagName}" id="${b.id}" class="${b.className?.slice(0, 50)}" text="${txt}"`);
      }
    });

    waitFor(() => {
      const buttons = document.querySelectorAll('button, a, [role="button"]');
      for (const b of buttons) {
        if (!isVisible(b)) continue;
        const text = (b.innerText || b.textContent || '').trim();
        if (text.startsWith('Free Download')) {
          return b;
        }
      }
      return null;
    }, (btn2) => {
      log('Step 2: Found "Free Download" button');
      safeClick(btn2);
      log('Step 2 done');

      // Step 3: Wait for "Start Download"
      log('Step 3: Waiting for "Start Download"...');
      waitFor(() => {
        const buttons = document.querySelectorAll('button, a, [role="button"]');
        for (const b of buttons) {
          if (!isVisible(b)) continue;
          const text = (b.innerText || b.textContent || '').trim();
          if (text.startsWith('Start Download')) {
            return b;
          }
        }
        return null;
      }, (btn3) => {
        log('Step 3: Found "Start Download" button');
        safeClick(btn3);
        log('All steps complete!');
      }, 1000);
    }, 1500);
  });
}
