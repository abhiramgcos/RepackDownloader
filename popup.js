const linkListDiv = document.getElementById('linkList');
const actionsDiv = document.getElementById('actions');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const countSpan = document.getElementById('count');
const selectAllRow = document.getElementById('selectAllRow');
const selectAllCb = document.getElementById('selectAll');

let groups = []; // [{ label, links: string[] }]

document.getElementById('fetchBtn').addEventListener('click', async () => {
  statusDiv.textContent = 'Scanning...';
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractGroups
  }, (results) => {
    groups = results[0].result.filter(g => g.links.length > 0);
    if (groups.length === 0) {
      statusDiv.textContent = 'No matching links found.';
      linkListDiv.style.display = 'none';
      actionsDiv.style.display = 'none';
      return;
    }
    renderTree();
    statusDiv.textContent = '';
  });
});

function renderTree() {
  const treeHtml = groups.map((g, gi) => {
    const linkRows = g.links.map((url, li) => `
      <div class="link-row">
        <input type="checkbox" class="link-cb" data-group="${gi}" data-link="${li}" checked>
        <label title="${url}">${url.split('/').pop()}</label>
      </div>`).join('');

    return `<div class="group">
      <div class="group-header" data-group="${gi}">
        <span class="arrow open">▶</span>
        <input type="checkbox" class="group-cb" data-group="${gi}" checked>
        <span class="p-label" title="${g.label}">${g.label}</span>
        <span class="p-count">(${g.links.length})</span>
      </div>
      <div class="group-links open">${linkRows}</div>
    </div>`;
  }).join('');

  linkListDiv.innerHTML = selectAllRow.outerHTML + treeHtml;
  linkListDiv.style.display = 'block';
  selectAllRow.style.display = 'flex';
  actionsDiv.style.display = 'flex';

  // Re-bind references after innerHTML
  bindEvents();
  updateCount();
}

function bindEvents() {
  // Select All
  document.getElementById('selectAll').addEventListener('change', function () {
    const checked = this.checked;
    document.querySelectorAll('.group-cb').forEach(cb => cb.checked = checked);
    document.querySelectorAll('.link-cb').forEach(cb => cb.checked = checked);
    updateCount();
  });

  // Group header click (expand/collapse)
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', function (e) {
      if (e.target.tagName === 'INPUT') return;
      const gi = this.dataset.group;
      const arrow = this.querySelector('.arrow');
      const linksDiv = this.parentElement.querySelector('.group-links');
      arrow.classList.toggle('open');
      linksDiv.classList.toggle('open');
    });
  });

  // Group checkbox → toggle all child links
  document.querySelectorAll('.group-cb').forEach(cb => {
    cb.addEventListener('change', function (e) {
      e.stopPropagation();
      const gi = this.dataset.group;
      document.querySelectorAll(`.link-cb[data-group="${gi}"]`)
        .forEach(lcb => lcb.checked = this.checked);
      syncSelectAll();
      updateCount();
    });
  });

  // Individual link checkbox
  document.querySelectorAll('.link-cb').forEach(cb => {
    cb.addEventListener('change', function () {
      const gi = this.dataset.group;
      const allInGroup = document.querySelectorAll(`.link-cb[data-group="${gi}"]`);
      const allChecked = [...allInGroup].every(c => c.checked);
      document.querySelector(`.group-cb[data-group="${gi}"]`).checked = allChecked;
      syncSelectAll();
      updateCount();
    });
  });
}

function syncSelectAll() {
  const allLinks = document.querySelectorAll('.link-cb');
  selectAllCb.checked = allLinks.length > 0 && [...allLinks].every(c => c.checked);
}

function updateCount() {
  const checked = document.querySelectorAll('.link-cb:checked').length;
  const total = document.querySelectorAll('.link-cb').length;
  countSpan.textContent = `${checked} of ${total} selected`;
  downloadBtn.disabled = checked === 0;
}

downloadBtn.addEventListener('click', () => {
  const selected = [];
  document.querySelectorAll('.link-cb:checked').forEach(cb => {
    const gi = parseInt(cb.dataset.group);
    const li = parseInt(cb.dataset.link);
    selected.push(groups[gi].links[li]);
  });
  chrome.runtime.sendMessage({ action: 'download', links: selected });
  statusDiv.textContent = `Starting ${selected.length} downloads...`;
  linkListDiv.style.display = 'none';
  actionsDiv.style.display = 'none';
});

function extractGroups() {
  const groups = [];
  document.querySelectorAll('p').forEach(p => {
    const links = Array.from(p.querySelectorAll('a'))
      .map(a => a.href)
      .filter(href => href.includes('.rar') || href.includes('.bin'));
    if (links.length > 0) {
      const text = (p.textContent || '').trim().substring(0, 60);
      groups.push({ label: text || '(empty paragraph)', links });
    }
  });
  return groups;
}
