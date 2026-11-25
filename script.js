/* ==========================================================================
   Body Scent — shared script (used by every page)
   Each section only runs if its page elements exist.
   - product.html : #filter-bar, #product-list
   - order.html   : #orderForm, #customerName, #contact, #items, #total, #note
   - admin.html   : #ordersTable tbody
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- Config ---------- */
  var APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbwRBX46Q5wGiyiy3cDel6SdTCOYNsRvM5DEFEssYJ0GlwfuHWUVpM2r9zCwlJu7brzFmg/exec';

  var SHEET_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vT1jdLK8zmkm_-QlloG7LawgomElzrXUqP1MmrLYyrds2XubX6RuLQsM_5ZZh9Gyywc_wAJHxB67pPP/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance', label: 'Romance' }
  ];

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(value) {
    var n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString('th-TH');
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function moodLabel(key) {
    for (var i = 0; i < MOODS.length; i++) {
      if (MOODS[i].key === key) return MOODS[i].label;
    }
    return key;
  }

  /* ==========================================================================
     1) product.html — product cards + mood filter
     ========================================================================== */
  function initProductPage() {
    var filterBar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = 'all';

    function buildFilterBar() {
      filterBar.innerHTML = '';
      MOODS.forEach(function (m) {
        var btn = el('button', 'filter-btn', m.label);
        btn.type = 'button';
        btn.setAttribute('data-mood', m.key === 'all' ? '' : m.key);
        btn.setAttribute('data-filter', m.key);
        btn.addEventListener('click', function () {
          setMood(m.key);
        });
        filterBar.appendChild(btn);
      });
    }

    function updateFilterState() {
      var buttons = filterBar.querySelectorAll('button');
      Array.prototype.forEach.call(buttons, function (btn) {
        var active = btn.getAttribute('data-filter') === currentMood;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function buildCard(p) {
      var card = el('article', 'product-card');
      card.setAttribute('data-mood', p.mood);

      /* image */
      var imageWrap = el('div', 'product-card__image');
      var img = document.createElement('img');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      imageWrap.appendChild(img);
      card.appendChild(imageWrap);

      /* body */
      var body = el('div', 'product-card__body');

      var mood = el('div', 'product-card__mood');
      mood.appendChild(el('span', 'mood-dot'));
      mood.appendChild(el('span', null, moodLabel(p.mood)));
      body.appendChild(mood);

      body.appendChild(el('h3', 'product-card__name', p.name));

      var sizeText = p.size || (p.type === 'rollon' ? 'โรลออน' : '');
      if (sizeText) body.appendChild(el('div', 'product-card__size', sizeText));

      if (p.description) {
        body.appendChild(el('p', 'product-card__desc', p.description));
      }

      /* footer: price + order button */
      var footer = el('div', 'product-card__footer');

      var price = el('div', 'price', formatPrice(p.price));
      price.appendChild(el('small', null, 'บาท'));
      footer.appendChild(price);

      var itemName = p.size ? p.name + ' ' + p.size : p.name;
      var order = el('a', 'btn btn--small', 'สั่งซื้อ');
      order.href =
        'order.html?item=' + encodeURIComponent(itemName) +
        '&price=' + encodeURIComponent(p.price);
      footer.appendChild(order);

      body.appendChild(footer);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.innerHTML = '';
      var shown = products.filter(function (p) {
        return currentMood === 'all' || p.mood === currentMood;
      });

      if (shown.length === 0) {
        list.appendChild(el('p', 'muted center', 'ยังไม่มีสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) {
        list.appendChild(buildCard(p));
      });
    }

    function setMood(key) {
      currentMood = key;
      updateFilterState();
      render();
    }

    buildFilterBar();

    fetch('products.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;

        /* auto-filter from ?mood=xxx (only if it is a known mood) */
        var param = (getParam('mood') || '').toLowerCase();
        var valid = MOODS.some(function (m) {
          return m.key === param;
        });
        currentMood = valid ? param : 'all';

        updateFilterState();
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.innerHTML = '';
        list.appendChild(
          el('p', 'notice', 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง')
        );
      });
  }

  /* ==========================================================================
     2) order.html — auto-fill from URL + submit to Apps Script
     ========================================================================== */
  function initOrderPage() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var itemsInput = document.getElementById('items');
    var totalInput = document.getElementById('total');

    /* auto-fill BOTH #items and #total as soon as the page loads */
    var item = getParam('item');
    var price = getParam('price');
    if (itemsInput && item !== null) itemsInput.value = item;
    if (totalInput && price !== null) totalInput.value = price;

    var submitting = false;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (submitting) return;
      submitting = true;

      var payload = {
        customerName: document.getElementById('customerName').value,
        contact: document.getElementById('contact').value,
        items: document.getElementById('items').value,
        total: document.getElementById('total').value,
        note: document.getElementById('note').value
      };

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
        .then(() => { window.location.href = 'thankyou.html'; })
        .catch(error => {
          submitting = false;
          console.error(error);
          alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        });
    });
  }

  /* ==========================================================================
     3) admin.html — read published Google Sheet CSV, newest first
     ========================================================================== */

  /* Minimal CSV parser: handles quoted fields, escaped quotes ("")
     and line breaks inside quotes. Returns an array of rows. */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); /* strip BOM */

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }

    /* last field / row without trailing newline */
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function initAdminPage() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    var COLUMNS = 6; /* timestamp, name, contact, items, total, note */

    function showMessage(message) {
      tbody.innerHTML = '';
      var tr = document.createElement('tr');
      var td = el('td', 'muted center', message);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(SHEET_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);

        /* drop the header row and fully empty rows */
        var data = rows.slice(1).filter(function (r) {
          return r.some(function (cell) {
            return cell.trim() !== '';
          });
        });

        if (data.length === 0) {
          showMessage('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        data.reverse(); /* newest first (sheet appends new rows at the bottom) */

        tbody.innerHTML = '';
        data.forEach(function (r) {
          var tr = document.createElement('tr');
          for (var i = 0; i < COLUMNS; i++) {
            var value = r[i] !== undefined ? r[i] : '';
            if (i === 4 && value !== '' && !isNaN(Number(value))) {
              value = formatPrice(value);
            }
            tr.appendChild(el('td', null, value));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        showMessage('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง');
      });
  }

  /* ---------- Boot ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
