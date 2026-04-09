/* Statblock renderer JS — extracted from monster-statblock project */
var StatblockRenderer = (function() {

    function getMod(score) {
        var mod = Math.floor((score - 10) / 2);
        return mod >= 0 ? "+" + mod : "" + mod;
    }

    function buildHeaderSection(monster) {
        var html = '';
        html += '<h1 class="monster-name">' + monster.name + '</h1>';
        html += '<p class="monster-type">' + monster.size + ' ' + monster.type + ', ' + monster.alignment + '</p>';
        html += '<hr class="divider">';
        html += '<div class="basic-stats">';
        html += '<p><span class="stat-label">Armor Class</span> <span>' + monster.ac + (monster.acType ? ' (' + monster.acType + ')' : '') + '</span></p>';
        html += '<p><span class="stat-label">Hit Points</span> <span>' + monster.hp + (monster.hpFormula ? ' (' + monster.hpFormula + ')' : '') + '</span></p>';
        html += '<p><span class="stat-label">Speed</span> <span>' + monster.speed + '</span></p>';
        html += '</div>';
        html += '<hr class="divider">';
        html += '<div class="abilities">';
        var abilityNames = ["str", "dex", "con", "int", "wis", "cha"];
        for (var i = 0; i < abilityNames.length; i++) {
            var ability = abilityNames[i];
            var score = monster.abilities[ability];
            html += '<div class="ability"><div class="ability-name">' + ability.toUpperCase() + '</div>';
            html += '<div class="ability-score">' + score + ' (' + getMod(score) + ')</div></div>';
        }
        html += '</div>';
        html += '<hr class="divider">';
        html += '<div class="secondary-stats">';
        if (monster.savingThrows) html += '<p><span class="stat-label">Saving Throws</span> <span>' + monster.savingThrows + '</span></p>';
        if (monster.skills) html += '<p><span class="stat-label">Skills</span> <span>' + monster.skills + '</span></p>';
        if (monster.damageVulnerabilities) html += '<p><span class="stat-label">Damage Vulnerabilities</span> <span>' + monster.damageVulnerabilities + '</span></p>';
        if (monster.damageResistances) html += '<p><span class="stat-label">Damage Resistances</span> <span>' + monster.damageResistances + '</span></p>';
        if (monster.damageImmunities) html += '<p><span class="stat-label">Damage Immunities</span> <span>' + monster.damageImmunities + '</span></p>';
        if (monster.conditionImmunities) html += '<p><span class="stat-label">Condition Immunities</span> <span>' + monster.conditionImmunities + '</span></p>';
        if (monster.senses) html += '<p><span class="stat-label">Senses</span> <span>' + monster.senses + '</span></p>';
        if (monster.languages) html += '<p><span class="stat-label">Languages</span> <span>' + monster.languages + '</span></p>';
        html += '<p><span class="stat-label">Challenge Rating</span> <span>' + monster.cr + (monster.xp ? ' (' + monster.xp + ' XP)' : '') + '</span></p>';
        html += '</div>';
        return html;
    }

    function buildFeaturesSection(monster) {
        if (!monster.features || monster.features.length === 0) return '';
        var html = '<hr class="divider">';
        for (var i = 0; i < monster.features.length; i++) {
            var feature = monster.features[i];
            html += '<div class="feature"><span class="feature-name">' + feature.name + '.</span> ';
            html += '<span class="feature-text">' + feature.text + '</span></div>';
        }
        return html;
    }

    function buildActionItemHtml(action, index) {
        var html = '<div class="action"><span class="action-name">' + action.name + '.</span> ';
        if (action.attackType) {
            html += '<span class="attack-type">' + action.attackType + ':</span> ' + action.toHit + ', ' + action.reach + ', ' + action.target + '. ';
            html += '<span class="hit-label"><em>Hit:</em></span> ' + action.damage;
        } else {
            html += '<span class="action-text">' + action.text + '</span>';
        }
        html += '</div>';
        return html;
    }

    function measureSectionHeight(htmlString, containerWidth) {
        var measurer = document.createElement('div');
        measurer.style.cssText = 'position:absolute;visibility:hidden;width:' + containerWidth + 'px;font-family:Times New Roman,serif;font-size:14px;line-height:1.4;padding:0;margin:0;';
        measurer.className = 'stat-block-measure';
        measurer.innerHTML = htmlString;
        document.body.appendChild(measurer);
        var height = measurer.offsetHeight;
        document.body.removeChild(measurer);
        return height;
    }

    // Main render function
    // Takes a monster JSON object and a DOM container element
    function render(monster, container) {
        // Build all sections as arrays of individual items
        // Each item is: { html: string, type: 'header'|'item'|'fixed', sectionId: string }
        var items = [];

        // Header + features are always fixed in col1 as a single block
        var fixedHtml = buildHeaderSection(monster) + buildFeaturesSection(monster);
        items.push({ html: fixedHtml, type: 'fixed', sectionId: 'header' });

        // Break each section into header + individual items
        // Items with <br><br> in text get split into paragraph-level sub-items
        function addSection(sectionId, headerText, entries, buildItemFn) {
            if (!entries || entries.length === 0) return;
            items.push({ html: '<h2 class="section-header">' + headerText + '</h2>', type: 'header', sectionId: sectionId });
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                // Check if text contains paragraph breaks
                if (entry.text && entry.text.indexOf('<br><br>') !== -1) {
                    var paragraphs = entry.text.split('<br><br>');
                    // First paragraph includes the name
                    var firstHtml = '<div class="action"><span class="action-name">' + entry.name + '.</span> <span class="action-text">' + paragraphs[0] + '</span></div>';
                    items.push({ html: firstHtml, type: 'item', sectionId: sectionId });
                    // Subsequent paragraphs are continuation items
                    for (var p = 1; p < paragraphs.length; p++) {
                        var contHtml = '<div class="action action-continuation"><span class="action-text">' + paragraphs[p] + '</span></div>';
                        items.push({ html: contHtml, type: 'item', sectionId: sectionId });
                    }
                } else {
                    items.push({ html: buildItemFn(entry, i), type: 'item', sectionId: sectionId });
                }
            }
        }

        // Actions
        addSection('actions', 'Actions', monster.actions, function(a, idx) {
            return buildActionItemHtml(a, idx);
        });

        // Bonus Actions
        addSection('bonusActions', 'Bonus Actions', monster.bonusActions, function(a, idx) {
            return '<div class="action"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
        });

        // Reactions
        addSection('reactions', 'Reactions', monster.reactions, function(a, idx) {
            return '<div class="action"><span class="action-name">' + a.name + '.</span> <span class="action-text">' + a.text + '</span></div>';
        });

        // Legendary Actions
        if (monster.legendaryActions && monster.legendaryActions.length > 0) {
            var legHeader = '<h2 class="section-header">Legendary Actions</h2>';
            if (monster.legendaryActionsDescription) {
                legHeader += '<p class="legendary-description">' + monster.legendaryActionsDescription + '</p>';
            }
            items.push({ html: legHeader, type: 'header', sectionId: 'legendary' });
            for (var i = 0; i < monster.legendaryActions.length; i++) {
                var la = monster.legendaryActions[i];
                items.push({ html: '<div class="legendary-action"><span class="legendary-action-name">' + la.name + '.</span> ' + la.text + '</div>', type: 'item', sectionId: 'legendary' });
            }
        }

        // Lair Actions (keep as one block since they're a list)
        if (monster.lairActions && monster.lairActions.length > 0) {
            var lairHtml = '<h2 class="section-header">Lair Actions</h2>';
            if (monster.lairActionsDescription) lairHtml += '<p>' + monster.lairActionsDescription + '</p>';
            lairHtml += '<ul>';
            for (var i = 0; i < monster.lairActions.length; i++) {
                lairHtml += '<li>' + monster.lairActions[i] + '</li>';
            }
            lairHtml += '</ul>';
            items.push({ html: lairHtml, type: 'fixed', sectionId: 'lair' });
        }

        // Villain Actions
        addSection('villainActions', 'Villain Actions', monster.villainActions, function(a, idx) {
            return '<div class="villain-action"><span class="villain-action-round">(Round ' + a.round + ')</span> <span class="villain-action-name">' + a.name + '.</span> ' + a.text + '</div>';
        });

        // Measure all items
        var colWidth = 380;
        var heights = [];
        var totalHeight = 0;
        for (var i = 0; i < items.length; i++) {
            var h = measureSectionHeight(items[i].html, colWidth);
            heights.push(h);
            totalHeight += h;
        }

        // Single column if short enough
        var SINGLE_COL_THRESHOLD = 1000;
        if (totalHeight <= SINGLE_COL_THRESHOLD) {
            var html = '<div class="stat-block single-column">';
            for (var i = 0; i < items.length; i++) html += items[i].html;
            html += '</div>';
            container.innerHTML = html;
            return;
        }

        // Two-column layout: find the best split point
        // Rules:
        // 1. Col2 can NEVER be significantly longer than col1 (max 5% taller)
        //    If no split satisfies this, keep extending col1 (col1 longer is OK)
        // 2. Col1 must end with a full paragraph of at least 4 lines (~80px)
        //    If the last item is shorter, need at least 2 items from that section in col1
        // 3. A section header can never be the last item in col1 (orphaned header)
        // 4. Col1 being longer than col2 is acceptable and preferred over col2 being longer
        var MIN_LAST_ITEM_HEIGHT = 80; // ~4 lines
        var MIN_COL1_HEIGHT = 400; // Minimum col1 height before allowing split

        // Try each possible split point and score it
        var bestSplit = -1;
        var bestScore = Infinity;

        for (var split = 1; split < items.length; split++) {
            // Col1 = items[0..split-1], Col2 = items[split..end]
            var col1Height = 0;
            var col2Height = 0;
            for (var j = 0; j < split; j++) col1Height += heights[j];
            for (var j = split; j < items.length; j++) col2Height += heights[j];

            // Rule: col1 must meet minimum height before we allow a split
            if (col1Height < MIN_COL1_HEIGHT) continue;

            // Rule: last item in col1 cannot be a section header (orphan)
            if (items[split - 1].type === 'header') continue;

            // Rule: col1 must end with a substantial paragraph (>= 4 lines)
            // If the last item is too short, need at least 2 items from that section
            var lastCol1Item = items[split - 1];
            var lastCol1Height = heights[split - 1];

            if (lastCol1Height < MIN_LAST_ITEM_HEIGHT && lastCol1Item.type === 'item') {
                var sectionId = lastCol1Item.sectionId;
                var sectionItemsInCol1 = 0;
                for (var j = 0; j < split; j++) {
                    if (items[j].sectionId === sectionId && items[j].type === 'item') {
                        sectionItemsInCol1++;
                    }
                }
                if (sectionItemsInCol1 < 2) continue;
            }

            // Rule: col2 must NEVER be significantly longer than col1 (max 5%)
            if (col2Height > col1Height * 1.05) continue;

            // Score: prefer balanced columns, but col1 being taller is OK
            // Col2 being taller is penalized more heavily
            var imbalance;
            if (col2Height > col1Height) {
                imbalance = (col2Height - col1Height) * 2;
            } else {
                imbalance = col1Height - col2Height;
            }
            if (imbalance < bestScore) {
                bestScore = imbalance;
                bestSplit = split;
            }
        }

        // If no valid split found, fall back to single column
        if (bestSplit === -1) {
            var html = '<div class="stat-block single-column">';
            for (var i = 0; i < items.length; i++) html += items[i].html;
            html += '</div>';
            container.innerHTML = html;
            return;
        }

        // Build two-column HTML
        var html = '<div class="stat-block two-column">';
        html += '<div class="stat-col stat-col-1">';
        for (var i = 0; i < bestSplit; i++) html += items[i].html;
        html += '</div>';
        html += '<div class="stat-col stat-col-2">';
        for (var i = bestSplit; i < items.length; i++) html += items[i].html;
        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
    }

    return { render: render };
})();
