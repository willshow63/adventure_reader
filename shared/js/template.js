/* Adventure Reader Template Engine
 * Loads config.json + adventure.md, parses markdown, builds full adventure reader DOM.
 * Usage: AdventureReader.init('config.json')
 */
var AdventureReader = (function () {

  // ── Markdown parser ───────────────────────────────────────────────
  function parseMarkdown(md) {
    // Normalize line endings
    md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    var lines = md.split('\n');
    var html = '';
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Blank line — skip
      if (line.trim() === '') { i++; continue; }

      // Horizontal rule
      if (/^---+\s*$/.test(line.trim())) { html += '<hr>'; i++; continue; }

      // Headings
      var hMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (hMatch) {
        var level = hMatch[1].length;
        var text = inlineFormat(hMatch[2].trim());
        html += '<h' + level + '>' + text + '</h' + level + '>';
        i++;
        continue;
      }

      // Blockquote — only continues across blank lines that start with >
      if (/^>\s?/.test(line)) {
        var bqLines = [];
        while (i < lines.length && /^>/.test(lines[i])) {
          // Line starts with > — strip the > prefix
          var stripped = lines[i].replace(/^>\s?/, '');
          if (stripped.trim() === '') {
            bqLines.push(''); // blank line within blockquote (e.g. "> " or ">")
          } else {
            bqLines.push(stripped);
          }
          i++;
        }
        html += buildBlockquote(bqLines);
        continue;
      }

      // Table (with header + separator row)
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\|?\s*[-:]+[-:|  ]*$/.test(lines[i + 1].trim())) {
        html += buildTable(lines, i);
        // Advance past header, separator, and all body rows
        i++; // header
        i++; // separator
        while (i < lines.length && lines[i].trim().indexOf('|') >= 0 && lines[i].trim() !== '') { i++; }
        continue;
      }

      // Headerless table rows (continuation rows starting with |)
      if (/^\|\s*\S/.test(line.trim()) && (i === 0 || lines[i - 1].trim() === '' || !/^\|/.test(lines[i - 1].trim()))) {
        // Check if next line also starts with | (multiple continuation rows)
        if (i + 1 < lines.length && /^\|/.test(lines[i + 1].trim())) {
          html += buildHeaderlessTable(lines, i);
          while (i < lines.length && /^\|/.test(lines[i].trim()) && lines[i].trim() !== '') { i++; }
          continue;
        }
      }

      // Unordered list
      if (/^(\s*)[-*+]\s/.test(line)) {
        var result = buildList(lines, i);
        html += result.html;
        i = result.nextIndex;
        continue;
      }

      // Paragraph — collect contiguous non-blank, non-special lines
      var pLines = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !/^#{1,6}\s/.test(lines[i]) &&
             !/^>\s?/.test(lines[i]) &&
             !/^---+\s*$/.test(lines[i].trim()) &&
             !(lines[i].indexOf('|') >= 0 && i + 1 < lines.length && /^\|?\s*[-:]+[-:|  ]*$/.test((lines[i + 1] || '').trim())) &&
             !/^(\s*)[-*+]\s/.test(lines[i])) {
        pLines.push(lines[i]);
        i++;
      }
      if (pLines.length > 0) {
        html += '<p>' + inlineFormat(pLines.join(' ')) + '</p>';
      }
    }

    return html;
  }

  // Inline formatting: bold, italic, links, inline code
  function inlineFormat(text) {
    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Bold+italic: ***text*** or ___text___
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_ (but not inside words for underscore)
    text = text.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
    text = text.replace(/(^|[\s(])_([^_]+?)_([\s).,;:!?]|$)/g, '$1<em>$2</em>$3');
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  }

  // Build a blockquote from collected lines
  function buildBlockquote(bqLines) {
    // Check if this is a sidebar: every non-blank line is wrapped in *...*
    var nonBlank = bqLines.filter(function (l) { return l.trim() !== ''; });
    function isItalicLine(l) {
      var t = l.trim();
      return /^\*[^*].*[^*]\*$/.test(t) || /^\*[^*]+\*$/.test(t);
    }
    var isSidebar = nonBlank.length > 0 && nonBlank.every(isItalicLine);

    if (isSidebar) {
      // Each non-blank line becomes its own <p> in the sidebar
      var inner = '';
      for (var j = 0; j < nonBlank.length; j++) {
        var content = nonBlank[j].trim().replace(/^\*\s*/, '').replace(/\s*\*$/, '');
        inner += '<p><em>' + inlineFormat(content) + '</em></p>';
      }
      return '<div class="sidebar">' + inner + '</div>';
    }

    // Normal read-aloud: split into paragraphs by blank lines
    var paragraphs = [];
    var current = [];
    for (var j = 0; j < bqLines.length; j++) {
      if (bqLines[j].trim() === '') {
        if (current.length > 0) {
          paragraphs.push(current.join(' '));
          current = [];
        }
      } else {
        current.push(bqLines[j]);
      }
    }
    if (current.length > 0) paragraphs.push(current.join(' '));

    var inner = '';
    for (var j = 0; j < paragraphs.length; j++) {
      inner += '<p>' + inlineFormat(paragraphs[j]) + '</p>';
    }
    return '<div class="read-aloud"><div class="ra-inner">' + inner + '</div></div>';
  }

  // Build a table from lines starting at index i
  function buildTable(lines, startIdx) {
    var headerLine = lines[startIdx].trim().replace(/^\|/, '').replace(/\|$/, '');
    var headers = headerLine.split('|').map(function (h) { return h.trim(); });

    // Skip separator (startIdx + 1)
    var rows = [];
    var ri = startIdx + 2;
    while (ri < lines.length && lines[ri].trim().indexOf('|') >= 0 && lines[ri].trim() !== '') {
      var rowLine = lines[ri].trim().replace(/^\|/, '').replace(/\|$/, '');
      rows.push(rowLine.split('|').map(function (c) { return c.trim(); }));
      ri++;
    }

    var tableHtml = '<table><thead><tr>';
    for (var h = 0; h < headers.length; h++) {
      tableHtml += '<th>' + inlineFormat(headers[h]) + '</th>';
    }
    tableHtml += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      var rowClass = r % 2 === 0 ? 'row-tinted' : 'row-clear';
      tableHtml += '<tr class="' + rowClass + '">';
      for (var c = 0; c < rows[r].length; c++) {
        tableHtml += '<td>' + inlineFormat(rows[r][c]) + '</td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  // Build a headerless table (continuation rows without a header/separator)
  function buildHeaderlessTable(lines, startIdx) {
    var rows = [];
    var ri = startIdx;
    while (ri < lines.length && /^\|/.test(lines[ri].trim()) && lines[ri].trim() !== '') {
      var rowLine = lines[ri].trim().replace(/^\|/, '').replace(/\|$/, '');
      rows.push(rowLine.split('|').map(function (c) { return c.trim(); }));
      ri++;
    }

    var tableHtml = '<table><tbody>';
    for (var r = 0; r < rows.length; r++) {
      var rowClass = r % 2 === 0 ? 'row-tinted' : 'row-clear';
      tableHtml += '<tr class="' + rowClass + '">';
      for (var c = 0; c < rows[r].length; c++) {
        tableHtml += '<td>' + inlineFormat(rows[r][c]) + '</td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  // Build an unordered list from lines starting at index i
  function buildList(lines, startIdx) {
    var html = '<ul>';
    var i = startIdx;
    var baseIndent = lines[i].match(/^(\s*)/)[1].length;

    while (i < lines.length) {
      var line = lines[i];
      if (line.trim() === '') { i++; continue; }

      var indentMatch = line.match(/^(\s*)[-*+]\s(.*)/);
      if (!indentMatch) break;

      var indent = indentMatch[1].length;
      if (indent < baseIndent) break;

      if (indent > baseIndent) {
        // Nested list
        var nested = buildList(lines, i);
        // Append nested list inside the last <li>
        html = html.replace(/<\/li>$/, '') + nested.html + '</li>';
        i = nested.nextIndex;
        continue;
      }

      html += '<li>' + inlineFormat(indentMatch[2]) + '</li>';
      i++;
    }

    html += '</ul>';
    return { html: html, nextIndex: i };
  }

  // ── Utility functions ─────────────────────────────────────────────

  function makeId(text) {
    return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  }

  function titleCase(str) {
    var small = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'of', 'in', 'on', 'at', 'to', 'by', 'with'];
    return str.toLowerCase().split(/\s+/).map(function (w, i) {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      if (small.indexOf(w) >= 0) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // ── Post-processing: convert raw parsed HTML elements to adventure reader conventions ──

  function postProcess(container, config) {
    // Remove <hr> elements (--- separators)
    var hrs = container.querySelectorAll('hr');
    for (var i = hrs.length - 1; i >= 0; i--) {
      hrs[i].parentNode.removeChild(hrs[i]);
    }

    // Process blockquotes: standard markdown parser produces <blockquote>
    // but our parseMarkdown already outputs .read-aloud and .sidebar divs,
    // so no blockquote conversion needed here.

    // Add alternating row classes to tables (already done in parser, but ensure)
    var tables = container.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var tbody = tables[t].querySelector('tbody');
      if (!tbody) continue;
      var rows = tbody.querySelectorAll('tr');
      for (var r = 0; r < rows.length; r++) {
        if (!rows[r].classList.contains('row-tinted') && !rows[r].classList.contains('row-clear')) {
          rows[r].className = r % 2 === 0 ? 'row-tinted' : 'row-clear';
        }
      }
    }

    // Convert inline d8 sub-table patterns in table cells to nested tables
    // Detects: **1** — text. **2** — text. ... **8** — text.
    var allTds = container.querySelectorAll('td');
    for (var i = 0; i < allTds.length; i++) {
      var td = allTds[i];
      var html = td.innerHTML;
      var match = html.match(/<strong>1<\/strong>\s*[—–-]\s*/);
      if (!match) continue;
      // Check there's at least a **2** as well
      if (!html.match(/<strong>2<\/strong>\s*[—–-]/)) continue;
      // Split on the pattern **N** —
      var parts = html.split(/(<strong>\d+<\/strong>\s*[—–-]\s*)/);
      if (parts.length < 5) continue;
      // Find where the numbered entries start
      var beforeEntries = '';
      var entries = [];
      var afterEntries = '';
      var inEntries = false;
      var currentNum = '';
      var currentText = '';
      for (var p = 0; p < parts.length; p++) {
        var numMatch = parts[p].match(/<strong>(\d+)<\/strong>\s*[—–-]\s*/);
        if (numMatch) {
          if (currentNum) entries.push({ num: currentNum, text: currentText.trim() });
          currentNum = numMatch[1];
          currentText = '';
          inEntries = true;
        } else if (inEntries) {
          currentText += parts[p];
        } else {
          beforeEntries += parts[p];
        }
      }
      if (currentNum) entries.push({ num: currentNum, text: currentText.trim() });
      if (entries.length < 3) continue;
      // Check if there's text after the last entry (the "On a success..." part)
      var lastEntry = entries[entries.length - 1];
      var sentenceBreak = lastEntry.text.indexOf('. On a success');
      if (sentenceBreak < 0) sentenceBreak = lastEntry.text.indexOf('. The wizard');
      if (sentenceBreak >= 0) {
        afterEntries = lastEntry.text.substring(sentenceBreak + 2);
        lastEntry.text = lastEntry.text.substring(0, sentenceBreak + 1);
      }
      // Build sub-table HTML
      var subHtml = beforeEntries;
      subHtml += '<table class="subtable" style="margin:10px 0 10px 16px;margin-right:24px;font-size:0.92em;width:calc(100% - 40px);">';
      subHtml += '<thead><tr><th style="border-right:1.5px solid var(--magenta);">d' + entries.length + '</th><th>Effect</th></tr></thead><tbody>';
      for (var e = 0; e < entries.length; e++) {
        var rc = e % 2 === 0 ? 'row-tinted' : 'row-clear';
        subHtml += '<tr class="' + rc + '"><td style="border-right:1.5px solid var(--magenta);">' + entries[e].num + '</td><td>' + entries[e].text + '</td></tr>';
      }
      subHtml += '</tbody></table>';
      if (afterEntries) subHtml += afterEntries;
      td.innerHTML = subHtml;
    }

    // Mark the first h2 with class first-section
    var firstH2 = container.querySelector('h2');
    if (firstH2) firstH2.classList.add('first-section');
  }

  // ── DOM building ──────────────────────────────────────────────────

  function buildDocument(html, config) {
    var doc = document.getElementById('document');
    var nav = document.getElementById('sidebar-nav');
    if (!doc || !nav) return;

    // Parse HTML string into elements using a temporary container
    var temp = document.createElement('div');
    temp.innerHTML = html;

    // Post-process
    postProcess(temp, config);

    // Build section-to-chapter lookup
    // Config sections are title-case; headings in markdown are UPPERCASE
    var chapters = config.chapters;
    var sectionToChapter = {};
    chapters.forEach(function (ch, ci) {
      ch.sections.forEach(function (s) {
        sectionToChapter[s.toUpperCase()] = ci;
      });
    });

    // Also build appendix section lookup
    var appendixSet = {};
    if (config.appendixSections) {
      config.appendixSections.forEach(function (s) {
        appendixSet[s.toUpperCase()] = true;
      });
    }

    // ── Title page ──
    var titlePage = document.createElement('div');
    titlePage.className = 'chapter-page';

    var titleBlock = document.createElement('div');
    titleBlock.className = 'title-block';
    titleBlock.innerHTML =
      '<h1>' + config.title.toUpperCase() + '</h1>' +
      '<p class="subtitle">' + config.subtitle + '</p>' +
      '<p class="subtitle" style="font-size:0.75em; letter-spacing:2px;">' + config.level + '</p>' +
      '<p class="set-in">' + config.setting + '</p>';
    titlePage.appendChild(titleBlock);
    doc.appendChild(titlePage);

    // ── Group elements into sections & chapter pages ──
    var elements = Array.from(temp.children);
    var currentSection = null;
    var currentPage = null;
    var lastChapterIdx = -1;
    var contentDiv = document.createElement('div');

    elements.forEach(function (el) {
      if (el.tagName === 'H2') {
        var h2Text = el.textContent.trim();
        var chIdx = sectionToChapter[h2Text];

        // New chapter?
        if (chIdx !== undefined && chIdx !== lastChapterIdx) {
          var ch = chapters[chIdx];

          // Gray gap between pages (skip for first)
          if (lastChapterIdx >= 0) {
            var brk = document.createElement('div');
            brk.className = 'chapter-break';
            contentDiv.appendChild(brk);
          }

          // New parchment page
          currentPage = document.createElement('div');
          currentPage.className = 'chapter-page';
          contentDiv.appendChild(currentPage);

          // Chapter opener title
          var opener = document.createElement('div');
          opener.className = 'chapter-opener';
          opener.id = 'ch-' + makeId(ch.title);
          var ttl = document.createElement('div');
          ttl.className = 'chapter-title';
          ttl.textContent = (ch.label ? ch.label + ': ' : '') + ch.title;
          opener.appendChild(ttl);
          currentPage.appendChild(opener);
          lastChapterIdx = chIdx;
        }

        currentSection = document.createElement('div');
        currentSection.className = 'section';
        el.id = makeId(h2Text);
        currentSection.appendChild(el);

        // Mark appendix sections
        if (appendixSet[h2Text]) {
          currentSection.classList.add('section-appendix');
        }

        if (currentPage) currentPage.appendChild(currentSection);
        else contentDiv.appendChild(currentSection);
      } else if (currentSection) {
        currentSection.appendChild(el);
      } else if (currentPage) {
        currentPage.appendChild(el);
      } else {
        contentDiv.appendChild(el);
      }
    });

    // Append all chapter pages to the document
    while (contentDiv.firstChild) {
      doc.appendChild(contentDiv.firstChild);
    }

    // ── Give all h3s IDs ──
    doc.querySelectorAll('.section h3').forEach(function (h3) {
      if (!h3.id) h3.id = makeId(h3.textContent);
    });

    // ── Table of Contents ──
    var toc = document.createElement('div');
    toc.className = 'toc';
    var tocTitle = document.createElement('div');
    tocTitle.className = 'toc-title';
    tocTitle.textContent = 'Contents';
    toc.appendChild(tocTitle);

    chapters.forEach(function (ch) {
      var chHead = document.createElement('div');
      chHead.className = 'toc-chapter';
      chHead.textContent = (ch.label ? ch.label + ': ' : '') + ch.title;
      toc.appendChild(chHead);

      ch.sections.forEach(function (secName) {
        var a = document.createElement('a');
        a.className = 'toc-entry';
        a.href = '#' + makeId(secName);
        a.textContent = titleCase(secName);
        toc.appendChild(a);
      });
    });

    // Insert ToC into the title page
    titlePage.appendChild(toc);

    // Add break after title page
    var postTocBreak = document.createElement('div');
    postTocBreak.className = 'chapter-break';
    titlePage.after(postTocBreak);

    // ── Render stat blocks from JSON ──
    renderStatblocks(config);

    // ── Build sidebar navigation ──
    buildNav(config, nav);
  }

  // ── Stat block links ──────────────────────────────────────────────

  function renderStatblocks(config) {
    var links = config.statblockLinks;
    if (!links) return;

    // In appendix sections, replace raw stat block HTML with simple linked entries
    var appendixSections = document.querySelectorAll('.section-appendix');
    appendixSections.forEach(function (sec) {
      var children = Array.from(sec.children);
      var i = 0;

      while (i < children.length) {
        var el = children[i];
        if (el.tagName === 'H3' && links[el.textContent.trim()] !== undefined) {
          var name = el.textContent.trim();
          var url = links[name];

          // Collect elements belonging to this stat block (until next h3/h2 or end)
          var toRemove = [el];
          var j = i + 1;
          while (j < children.length && children[j].tagName !== 'H3' && children[j].tagName !== 'H2') {
            toRemove.push(children[j]);
            j++;
          }

          // Create a styled link entry
          var entry = document.createElement('div');
          entry.className = 'statblock-link-entry';
          entry.id = el.id;
          entry.style.scrollMarginTop = '24px';

          if (url) {
            var a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.className = 'statblock-link';
            a.textContent = name;
            entry.appendChild(a);
          } else {
            var span = document.createElement('span');
            span.className = 'statblock-link-pending';
            span.textContent = name;
            entry.appendChild(span);
          }

          el.before(entry);
          toRemove.forEach(function (r) { r.remove(); });

          children = Array.from(sec.children);
          i = 0;
          continue;
        }
        i++;
      }
    });

    // Auto-link creature names throughout the document body
    var names = Object.keys(links).filter(function(n) { return links[n]; });
    // Sort by length descending so longer names match first (e.g., "Grimeback Thug" before "Grimeback")
    names.sort(function(a, b) { return b.length - a.length; });

    if (names.length === 0) return;

    // Build regex pattern
    var escaped = names.map(function(n) {
      return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var pattern = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'g');

    // Walk text nodes in .section divs (not in appendix link entries, not in headings, not in existing links)
    var sections = document.querySelectorAll('.section:not(.section-appendix)');
    sections.forEach(function(sec) {
      var walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, null, false);
      var textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach(function(node) {
        // Skip if inside a link, heading, or nav
        var parent = node.parentElement;
        if (!parent) return;
        if (parent.tagName === 'A' || parent.tagName === 'H2' || parent.tagName === 'H3' ||
            parent.closest('a') || parent.closest('.sidebar-nav') || parent.closest('.statblock-link-entry')) return;

        var text = node.textContent;
        if (!pattern.test(text)) return;
        pattern.lastIndex = 0;

        var frag = document.createDocumentFragment();
        var lastIdx = 0;
        var match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          // Add text before match
          if (match.index > lastIdx) {
            frag.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
          }
          // Create link
          var a = document.createElement('a');
          a.href = links[match[1]];
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'creature-link';
          a.textContent = match[1];
          frag.appendChild(a);
          lastIdx = pattern.lastIndex;
        }
        if (lastIdx < text.length) {
          frag.appendChild(document.createTextNode(text.substring(lastIdx)));
        }
        node.parentNode.replaceChild(frag, node);
      });
    });
  }

  // ── Sidebar navigation ────────────────────────────────────────────

  function buildNav(config, nav) {
    var chapters = config.chapters;
    var allHeadings = [];

    // Nav title
    var navTitle = document.createElement('a');
    navTitle.href = '#';
    navTitle.className = 'nav-title';
    navTitle.textContent = config.title;
    navTitle.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.appendChild(navTitle);

    chapters.forEach(function (ch) {
      var chDiv = document.createElement('div');
      chDiv.className = 'nav-section';
      var chId = 'ch-' + makeId(ch.title);

      // Chapter link
      var chLink = document.createElement('a');
      chLink.className = 'nav-h2';
      chLink.href = '#' + chId;

      var arrow = document.createElement('span');
      arrow.className = 'nav-arrow';
      arrow.textContent = '\u25B6';
      chLink.appendChild(arrow);

      var span = document.createElement('span');
      span.textContent = (ch.label ? ch.label + ': ' : '') + ch.title;
      chLink.appendChild(span);
      chDiv.appendChild(chLink);

      // Children: h2 sections
      var childDiv = document.createElement('div');
      childDiv.className = 'nav-children';

      ch.sections.forEach(function (secName) {
        var h2El = document.getElementById(makeId(secName));
        if (!h2El) return;
        allHeadings.push(h2El);

        var secLink = document.createElement('a');
        secLink.className = 'nav-h3';
        secLink.href = '#' + h2El.id;
        secLink.textContent = titleCase(secName);
        childDiv.appendChild(secLink);

        // Add h3 subsections
        var sec = h2El.closest('.section');
        if (sec) {
          sec.querySelectorAll('h3').forEach(function (h3) {
            if (!h3.id) h3.id = makeId(h3.textContent);
            allHeadings.push(h3);
            var h3Link = document.createElement('a');
            h3Link.className = 'nav-h4';
            h3Link.href = '#' + h3.id;
            h3Link.textContent = h3.textContent;
            childDiv.appendChild(h3Link);
          });
        }
      });

      chDiv.appendChild(childDiv);
      nav.appendChild(chDiv);

      // Toggle click
      (function (cd, ar) {
        chLink.addEventListener('click', function (e) {
          cd.classList.toggle('open');
          ar.classList.toggle('open');
          if (e.target === ar) e.preventDefault();
        });
      })(childDiv, arrow);
    });

    // Scroll-based highlighting
    function updateActive() {
      var scrollPos = window.scrollY + 120;
      var activeH = null;
      for (var i = allHeadings.length - 1; i >= 0; i--) {
        if (allHeadings[i].offsetTop <= scrollPos) {
          activeH = allHeadings[i];
          break;
        }
      }
      var activeId = activeH ? activeH.id : null;

      // Find which chapter this heading belongs to
      var activeChIdx = -1;
      if (activeId) {
        for (var c = 0; c < chapters.length; c++) {
          for (var s = 0; s < chapters[c].sections.length; s++) {
            if (makeId(chapters[c].sections[s]) === activeId) {
              activeChIdx = c;
              break;
            }
          }
          if (activeChIdx >= 0) break;
          // Also check h3s within this chapter
          if (activeChIdx < 0) {
            for (var s = 0; s < chapters[c].sections.length; s++) {
              var secEl = document.getElementById(makeId(chapters[c].sections[s]));
              if (secEl) {
                var secDiv = secEl.closest('.section');
                if (secDiv) {
                  var h3s = secDiv.querySelectorAll('h3');
                  for (var h = 0; h < h3s.length; h++) {
                    if (h3s[h].id === activeId) {
                      activeChIdx = c;
                      break;
                    }
                  }
                }
              }
              if (activeChIdx >= 0) break;
            }
          }
          if (activeChIdx >= 0) break;
        }
      }

      // Update nav
      var navSections = nav.querySelectorAll('.nav-section');
      navSections.forEach(function (ns, idx) {
        var cd = ns.querySelector('.nav-children');
        var ar = ns.querySelector('.nav-arrow');
        var isActiveCh = idx === activeChIdx;
        if (cd) cd.classList.toggle('open', isActiveCh);
        if (ar) ar.classList.toggle('open', isActiveCh);

        if (cd) {
          cd.querySelectorAll('a').forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + activeId);
          });
        }

        var chLink = ns.querySelector('.nav-h2');
        if (chLink) chLink.classList.toggle('active', isActiveCh);
      });
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // ── Main init ─────────────────────────────────────────────────────

  function init(configPath) {
    // Determine base path from configPath
    var basePath = configPath.substring(0, configPath.lastIndexOf('/') + 1);

    fetch(configPath)
      .then(function (r) { return r.json(); })
      .then(function (config) {
        // Set page title
        document.title = config.title;

        // Fetch the markdown
        return fetch(basePath + 'adventure.md')
          .then(function (r) { return r.text(); })
          .then(function (md) {
            // Remove the top-level H1 and H3 subtitle (they become the title block)
            // Strip the first heading block (# TITLE\n\n### subtitle\n\n**setting**)
            md = md.replace(/^#\s+.*\n+/, '');
            md = md.replace(/^###\s+.*\n+/, '');
            md = md.replace(/^\*\*.*?\*\*\s*\n+/, '');

            // Parse markdown to HTML
            var html = parseMarkdown(md);

            // Build the document
            buildDocument(html, config);
          });
      })
      .catch(function (err) {
        console.error('AdventureReader init failed:', err);
        document.body.innerHTML = '<p style="color:red;padding:20px;">Failed to load adventure: ' + err.message + '</p>';
      });
  }

  return { init: init };
})();
