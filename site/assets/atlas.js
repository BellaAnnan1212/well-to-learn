/* Well to Learn · atlas.js · the choropleth, the country card and the table twin.
   Vanilla plus two vendored libraries (d3 for the projection, topojson-client for the shapes).
   No third-party request: both are served from this site's own /vendor/.

   What this file will not do, and why:
   - It never animates a number. Every value is in the DOM the moment it is written, because a
     number mid-count is a number no source published.
   - It never animates `fill`. A layer change fades a SECOND fill layer over the first, once,
     uniformly, 300ms for the whole map. Never band by band: an order that ends on the darkest
     band would make a finale of the highest rates.
   - It never invents a value. A country with no number is drawn with the hatch and reads
     "no data" in the card and the table. Zero is a value a source reported, never a gap.
   - It never moves focus except when a person opened something. Esc closes the card and puts
     focus back on the country they came from. */
(function () {
  'use strict';

  var holder = document.getElementById('map-holder');
  if (!holder || !window.d3 || !window.topojson) { return; } /* the table below is the page */

  var BASE = new URL('.', document.currentScript ? document.currentScript.src : location.href);
  var cardHolder = document.getElementById('ccard-holder');
  var legendBody = document.getElementById('legend-body');
  var legendCap = document.getElementById('legend-cap');
  var legendNote = document.getElementById('legend-note');
  var mapCap = document.getElementById('map-cap');
  var fallback = document.getElementById('map-fallback');

  var atlas = null, indicators = null, sources = null, shapes = null;
  var byNumeric = {};          /* topojson numeric id -> country record */
  var current = null;          /* the layer being shown */
  var selected = null;         /* ISO3 of the open card */
  var front = 0;               /* which of the two fill layers is on top */
  var groups = [];             /* the two fill layers */
  var paths = [[], []];        /* the path elements of each layer, parallel arrays */

  function get(url) {
    return fetch(new URL(url, BASE).href).then(function (r) {
      if (!r.ok) { throw new Error(url + ': HTTP ' + r.status); }
      return r.json();
    });
  }

  function spec(id) {
    for (var i = 0; i < indicators.indicators.length; i += 1) {
      if (indicators.indicators[i].id === id) { return indicators.indicators[i]; }
    }
    return null;
  }

  function sourceById(id) {
    for (var i = 0; i < sources.sources.length; i += 1) {
      if (sources.sources[i].id === id) { return sources.sources[i]; }
    }
    return null;
  }

  /* Which of the five bands a value falls in, 1 to 5. A categorical layer reads its own table.
     Thresholds are upper-bound inclusive and come from indicators.json, never from this file. */
  function bandOf(s, field) {
    if (!field || field.value === null || field.value === undefined) { return null; }
    if (s.categories) {
      for (var c = 0; c < s.categories.length; c += 1) {
        if (s.categories[c].value === field.value) { return s.categories[c].band; }
      }
      return null;
    }
    if (!s.bands) { return null; }
    for (var i = 0; i < s.bands.length; i += 1) {
      if (field.value <= s.bands[i]) { return i + 1; }
    }
    return s.bands.length + 1;
  }

  function fmt(s, field) {
    if (!field || field.value === null || field.value === undefined) { return 'no data'; }
    if (typeof field.value === 'boolean') { return field.value ? 'yes' : 'no'; }
    if (typeof field.value === 'string') {
      if (s.categories) {
        for (var c = 0; c < s.categories.length; c += 1) {
          if (s.categories[c].value === field.value) { return s.categories[c].label; }
        }
      }
      return field.value;
    }
    var d = typeof s.decimals === 'number' ? s.decimals : 1;
    return field.value.toFixed(d);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined && text !== null) { n.textContent = text; }
    return n;
  }

  /* ---------- the map ---------- */

  function drawMap() {
    var W = 960, H = 480;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'map map-uniform');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', 'map-cap');

    svg.innerHTML = '<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
      + '<rect class="hatch-bg" width="4" height="4"/><rect class="hatch-line" width="1" height="4"/></pattern></defs>'
      + '<rect class="bg" width="' + W + '" height="' + H + '"/>';

    var features = window.topojson.feature(shapes, shapes.objects.countries).features;
    var projection = window.d3.geoNaturalEarth1().fitSize([W, H - 10], { type: 'FeatureCollection', features: features });
    var geoPath = window.d3.geoPath(projection);

    /* Two fill layers with identical geometry. One is shown; a layer change paints the other and
       fades it in over the top, which is a cross-fade of pictures, not an animation of colour. */
    for (var g = 0; g < 2; g += 1) {
      var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'fills land');
      group.style.opacity = g === 0 ? '1' : '0';
      for (var i = 0; i < features.length; i += 1) {
        var f = features[i];
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', geoPath(f) || '');
        p.setAttribute('class', 'nodata');
        group.appendChild(p);
        paths[g].push(p);
      }
      groups.push(group);
      svg.appendChild(group);
    }

    /* The hit layer sits on top, transparent, and carries the keyboard and the pointer. Keeping it
       separate from the fills means a cross-fade never interrupts a click or blurs the focus ring. */
    var hits = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    hits.setAttribute('class', 'hits');
    for (var j = 0; j < features.length; j += 1) {
      var feat = features[j];
      var rec = byNumeric[String(feat.id)];
      var hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', geoPath(feat) || '');
      hit.setAttribute('class', 'hit');
      if (rec) {
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        hit.setAttribute('data-iso3', rec.iso3);
        hit.setAttribute('aria-label', rec.name);
        var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = rec.name;
        hit.appendChild(title);
      } else {
        hit.setAttribute('aria-hidden', 'true');
      }
      hits.appendChild(hit);
    }
    svg.appendChild(hits);

    /* The selection outline: a light halo under a red line, both non-scaling, drawn last so it is
       never covered. Red is legal here because every map ground is a light olive or the card. */
    var selG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    selG.setAttribute('class', 'selection');
    selG.setAttribute('aria-hidden', 'true');
    svg.appendChild(selG);

    /* The keyboard focus ring, drawn the same way the selection is: a light halo UNDER a red line.
       A bare red stroke on the map fails badly, because the ground it lands on is whatever band
       the country happens to be painted in: recomputed against tokens.css, red is 2.54 on ramp-3,
       1.22 on ramp-4 and 2.12 on ramp-5, and ramp-5 is the same hex as --wtl-ink, so that last one
       is exactly the "red on ink" pair C2 bans. The halo gives the ring its own light ground, so
       the contrast no longer depends on the data. Drawn last so nothing covers it. */
    var focusG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    focusG.setAttribute('class', 'focus-ring');
    focusG.setAttribute('aria-hidden', 'true');
    svg.appendChild(focusG);

    holder.innerHTML = '';
    holder.appendChild(svg);
    if (fallback && fallback.parentNode) { fallback.parentNode.removeChild(fallback); }

    hits.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-iso3]') : null;
      if (t) { openCard(t.getAttribute('data-iso3'), t); }
    });
    hits.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') { return; }
      var t = e.target.closest ? e.target.closest('[data-iso3]') : null;
      if (t) { e.preventDefault(); openCard(t.getAttribute('data-iso3'), t); }
    });

    /* focusin/focusout rather than :focus-visible in CSS, because the ring needs two stacked
       strokes and one SVG path can only carry one. These fire for keyboard focus and are cleared
       on blur, so nothing persists. */
    hits.addEventListener('focusin', function (e) {
      var t = e.target.closest ? e.target.closest('[data-iso3]') : null;
      if (t) { drawFocus(t.getAttribute('data-iso3')); }
    });
    hits.addEventListener('focusout', function () { drawFocus(null); });

    return { svg: svg, selG: selG, focusG: focusG, features: features, geoPath: geoPath };
  }

  var map = null;

  /* Paint the BACK layer with a layer's bands, then fade it to the front. One transition, one
     duration, the whole map at once. */
  function showLayer(id) {
    var s = spec(id);
    if (!s) { return; }
    current = id;
    var back = 1 - front;
    var features = map.features;

    for (var i = 0; i < features.length; i += 1) {
      var rec = byNumeric[String(features[i].id)];
      var band = rec ? bandOf(s, rec.indicators[id]) : null;
      paths[back][i].setAttribute('class', band ? 'b' + band : 'nodata');
    }

    groups[back].style.opacity = '1';
    groups[front].style.opacity = '0';
    front = back;

    if (mapCap) { mapCap.textContent = s.label + ' · ' + s.kind; }
    if (legendCap) { legendCap.textContent = s.label; }
    if (legendNote) { legendNote.textContent = s.note; }
    drawLegend(s);
    if (selected) { renderCard(selected); }
  }

  function drawLegend(s) {
    if (!legendBody) { return; }
    var counts = [0, 0, 0, 0, 0];
    var none = 0;
    var list = Object.keys(atlas.countries);
    for (var i = 0; i < list.length; i += 1) {
      var b = bandOf(s, atlas.countries[list[i]].indicators[s.id]);
      if (b) { counts[b - 1] += 1; } else { none += 1; }
    }

    var rowsHtml = '';
    if (s.categories) {
      for (var c = 0; c < s.categories.length; c += 1) {
        var cat = s.categories[c];
        rowsHtml += '<tr class="b' + cat.band + '"><td><span class="sw sw-' + cat.band + '"></span> '
          + esc(cat.label) + '</td><td class="range">·</td><td>' + counts[cat.band - 1] + '</td></tr>';
      }
    } else if (s.bands) {
      var lo = 0;
      for (var k = 0; k <= s.bands.length; k += 1) {
        var hi = s.bands[k];
        var range = k === s.bands.length
          ? 'over ' + s.bands[s.bands.length - 1]
          : (k === 0 ? 'up to ' + hi : 'over ' + lo + ' to ' + hi);
        rowsHtml += '<tr class="b' + (k + 1) + '"><td><span class="sw sw-' + (k + 1) + '"></span> band '
          + (k + 1) + '</td><td class="range">' + esc(range) + '</td><td>' + counts[k] + '</td></tr>';
        lo = hi;
      }
    }
    rowsHtml += '<tr class="nd"><td><span class="sw sw-nodata"></span> no data</td><td class="range">·</td><td>' + none + '</td></tr>';
    legendBody.innerHTML = rowsHtml;
  }

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- the country card ---------- */

  var lastTrigger = null;

  function openCard(iso3, trigger) {
    selected = iso3;
    lastTrigger = trigger || null;
    renderCard(iso3);
    drawSelection(iso3);
    var h = cardHolder.querySelector('.ccard-title');
    if (h) { h.focus(); }
  }

  function closeCard() {
    selected = null;
    cardHolder.innerHTML = '';
    drawSelection(null);
    if (lastTrigger && lastTrigger.isConnected) { lastTrigger.focus(); }
    lastTrigger = null;
  }

  /* Halo under line, into whichever group is asked for. The halo is what makes the red legible on
     a dark band: without it the ring's contrast depends on the country's own value. */
  function outline(group, iso3, lineClass) {
    group.innerHTML = '';
    if (!iso3) { return; }
    for (var i = 0; i < map.features.length; i += 1) {
      var rec = byNumeric[String(map.features[i].id)];
      if (!rec || rec.iso3 !== iso3) { continue; }
      var d = map.geoPath(map.features[i]) || '';
      var halo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      halo.setAttribute('d', d); halo.setAttribute('class', 'halo'); halo.setAttribute('fill', 'none');
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', d); line.setAttribute('class', lineClass);
      group.appendChild(halo);
      group.appendChild(line);
    }
  }

  function drawSelection(iso3) { outline(map.selG, iso3, 'sel'); }
  function drawFocus(iso3) { outline(map.focusG, iso3, 'focus-line'); }

  function kv(label, valueText, metaText) {
    var li = document.createElement('li');
    li.appendChild(el('span', 'k', label));
    li.appendChild(el('span', 'v', valueText));
    if (metaText) { li.appendChild(el('span', 'm', metaText)); }
    return li;
  }

  /* One line of the card. The meta line is not decoration: it is the year, the stamp and the
     source, which is what makes the number quotable. A missing value still gets its line, so a
     reader can see that the question was asked and nobody has answered it. */
  function indicatorLine(rec, id) {
    var s = spec(id);
    if (!s) { return null; }
    var f = rec.indicators[id];
    if (!f || f.value === null || f.value === undefined) {
      return kv(s.label, 'no data', 'nobody has published this for ' + rec.name);
    }
    var meta = [];
    if (f.year) { meta.push(String(f.year)); }
    meta.push(s.kind);
    var src = sourceById(f.source);
    if (src) { meta.push(src.publisher); }
    /* An old value is not a wrong value, but it must not look like a fresh one. */
    if (f.stale) { meta.push('OLDER THAN THIS INDICATOR’S ' + s.max_age + '-YEAR LIMIT (' + f.age + ' years)'); }
    /* UIS NAT_EST: a national estimate, not a UIS one. Two different kinds of number. */
    if (f.qualifier === 'NAT_EST') { meta.push('a national estimate, not a UNESCO one'); }
    else if (f.qualifier) { meta.push('UIS qualifier ' + f.qualifier); }
    if (f.reported_zero) { meta.push('a reported zero, not a gap'); }
    if (f.confirmed === false) { meta.push('unconfirmed in the source table'); }
    if (f.low !== undefined && f.low !== null && f.high !== undefined && f.high !== null) {
      meta.push(f.low.toFixed(1) + ' to ' + f.high.toFixed(1));
    }
    var unit = typeof f.value === 'number' ? ' ' + s.unit : '';
    return kv(s.label, fmt(s, f) + (typeof f.value === 'number' ? '' : ''), meta.join(' · ') + (unit ? ' ·' + unit : ''));
  }

  function section(card, heading, lines) {
    var real = lines.filter(Boolean);
    if (real.length === 0) { return; }
    card.appendChild(el('h4', null, heading));
    var ul = el('ul', 'kv');
    for (var i = 0; i < real.length; i += 1) { ul.appendChild(real[i]); }
    card.appendChild(ul);
  }

  function renderCard(iso3) {
    var rec = atlas.countries[iso3];
    cardHolder.innerHTML = '';
    if (!rec) { return; }

    var card = el('article', 'ccard');
    card.setAttribute('aria-labelledby', 'ccard-title');

    var head = el('div', 'ccard-head');
    var titleWrap = el('div');
    var h3 = el('h3', 'ccard-title', rec.name);
    h3.id = 'ccard-title';
    h3.tabIndex = -1;
    titleWrap.appendChild(h3);
    var bits = [rec.sub_region || rec.region || '', rec.context.income_group || 'income group not published'];
    if (rec.context.gdp_per_capita) {
      bits.push('GDP per person US$' + rec.context.gdp_per_capita.value.toLocaleString('en') + ' (' + rec.context.gdp_per_capita.year + ')');
    }
    titleWrap.appendChild(el('p', 'meta', bits.filter(Boolean).join(' · ')));
    head.appendChild(titleWrap);

    var close = el('button', 'btn ccard-close', 'Close');
    close.type = 'button';
    close.addEventListener('click', closeCard);
    head.appendChild(close);
    card.appendChild(head);

    /* The card's order is the plan's, and it is deliberate: the young person first, then the care
       they can reach, then the school, then what their government promised. */
    section(card, 'Young people', [indicatorLine(rec, 'suicide_10_19'), indicatorLine(rec, 'suicide_std')]);
    section(card, 'Care', [indicatorLine(rec, 'psychiatrists'), atlasBlock(rec)]);
    section(card, 'School', [
      indicatorLine(rec, 'out_of_school_lsec'),
      indicatorLine(rec, 'completion_lsec'),
      indicatorLine(rec, 'learning_poverty'),
      indicatorLine(rec, 'school_corporal_punishment'),
    ]);
    section(card, 'What this country promised', treatyLines(rec));
    section(card, 'Conflict', [conflictLine(rec)]);

    var foot = el('div', 'ccard-foot');
    foot.appendChild(el('p', 'src', 'Every line above names its own year, its kind and who published it. A line reading "no data" means nobody has published that number for ' + rec.name + ': it does not mean zero.'));
    var kbd = el('p', 'src');
    kbd.innerHTML = 'Press <kbd>Esc</kbd> to close and go back to the map.';
    foot.appendChild(kbd);
    card.appendChild(foot);

    cardHolder.appendChild(card);
    /* Nothing is done here to reveal the card, and that is the point. Its entrance is a CSS
       keyframe animation that runs on insertion; the card's own base style is fully visible, so
       if the animation never runs (reduced motion, no motion class, a hidden tab that runs no
       frames) the card is simply there, with every number readable. Visibility never waits on
       JavaScript. */
  }

  function atlasBlock(rec) {
    var f = rec.indicators.atlas2024;
    if (!f || !f.value || Object.keys(f.value).length === 0) {
      return kv('WHO Mental Health Atlas 2024', 'not read yet', 'this country profile has not been transcribed by hand yet. That is a fact about this site, not about ' + rec.name);
    }
    var parts = [];
    for (var k in f.value) { if (Object.prototype.hasOwnProperty.call(f.value, k)) { parts.push(k + ': ' + f.value[k]); } }
    return kv('WHO Mental Health Atlas 2024', String(parts.length) + ' field(s)', parts.join(' · ') + ' · self-reported to WHO, ' + f.year);
  }

  var TREATY_NAMES = {
    crc: 'Convention on the Rights of the Child',
    icescr: 'Covenant on Economic, Social and Cultural Rights',
    crpd: 'Convention on the Rights of Persons with Disabilities',
    op3_crc: 'CRC complaints protocol (OP3)',
  };

  function treatyLines(rec) {
    var out = [];
    var ids = ['crc', 'icescr', 'crpd', 'op3_crc'];
    for (var i = 0; i < ids.length; i += 1) {
      var t = rec.treaties[ids[i]];
      var word = t ? (t.status === 'party' ? 'Bound' : (t.status === 'signatory' ? 'Signed only' : 'Not bound')) : 'Not bound';
      var meta = [];
      if (t && t.date) { meta.push('since ' + t.date); }
      else if (t && t.signed) { meta.push('signed ' + t.signed + ', not yet bound'); }
      if (t && t.status_as_at) { meta.push('UN status as at ' + t.status_as_at); }
      else { meta.push('not listed by the UN as a participant'); }
      out.push(kv(TREATY_NAMES[ids[i]], word, meta.join(' · ')));
    }
    return out;
  }

  function conflictLine(rec) {
    var f = rec.indicators.education_under_attack;
    if (!f) {
      return kv('Education under Attack 2026', 'no profile', 'GCPEA profiles 28 countries. No profile does NOT mean no attacks: it can mean nobody is counting there');
    }
    return kv('Education under Attack 2026', 'profiled', (f.severity ? f.severity + ' · ' : '') + 'GCPEA, ' + f.edition + '. Never ranked here, because the count is of REPORTED attacks');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && selected) { e.preventDefault(); closeCard(); }
  });

  /* ---------- the table twin ---------- */

  function wireTable() {
    var input = document.getElementById('tfilter');
    var table = document.getElementById('atlas-table');
    var count = document.getElementById('tcount');
    if (!input || !table || !count) { return; }
    var rows = [].slice.call(table.tBodies[0].rows);
    var total = rows.length;

    function say(n) {
      count.textContent = n === total ? total + ' states' : n + ' of ' + total + ' states';
    }
    say(total);

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      for (var i = 0; i < rows.length; i += 1) {
        var hit = !q || rows[i].cells[0].textContent.toLowerCase().indexOf(q) !== -1;
        rows[i].hidden = !hit;
        if (hit) { shown += 1; }
      }
      say(shown);
    });
  }

  /* ---------- start ---------- */

  Promise.all([
    get('../data/atlas.json'),
    get('../data/indicators.json'),
    get('../data/sources.json'),
    get('../vendor/countries-110m.json'),
  ]).then(function (r) {
    atlas = r[0]; indicators = r[1]; sources = r[2]; shapes = r[3];

    var keys = Object.keys(atlas.countries);
    for (var i = 0; i < keys.length; i += 1) {
      var c = atlas.countries[keys[i]];
      byNumeric[String(Number(c.numeric))] = c; /* topojson ids drop the leading zeros */
      byNumeric[c.numeric] = c;
    }

    map = drawMap();

    var picks = [].slice.call(document.querySelectorAll('input[name="layer"]'));
    for (var p = 0; p < picks.length; p += 1) {
      picks[p].addEventListener('change', function (e) {
        if (e.target.checked) { showLayer(e.target.value); }
      });
    }
    var start = picks.filter(function (x) { return x.checked; })[0];
    showLayer(start ? start.value : 'out_of_school_lsec');
    wireTable();
  }).catch(function (err) {
    if (fallback) {
      fallback.textContent = 'The map could not load (' + err.message + '). Every number it would show is in the table below, which needs no JavaScript.';
    }
  });
})();
