import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';

function heading1(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 120 } });
}

function heading2(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 80 } });
}

function heading3(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 60 } });
}

function para(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
    spacing: { after: 120 },
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    bullet: { level },
    spacing: { after: 80 },
  });
}

function inlineBold(parts: { text: string; bold?: boolean }[]): Paragraph {
  return new Paragraph({
    children: parts.map((p) => new TextRun({ text: p.text, bold: p.bold ?? false })),
    spacing: { after: 120 },
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function tableHeader(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })], alignment: AlignmentType.CENTER })],
    shading: { fill: 'D9E1F2' },
  });
}

function tableCell(text: string, center = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text })], alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT })],
  });
}

function simpleTable(headers: string[], rows: string[][]): Table {
  const borderStyle = { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' };
  const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle, insideH: borderStyle, insideV: borderStyle };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ children: headers.map(tableHeader) }),
      ...rows.map((row) => new TableRow({ children: row.map((cell, i) => tableCell(cell, i > 0)) })),
    ],
  });
}

export async function downloadInstructorGuide(): Promise<void> {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'steps',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) } },
        },
        children: [
          // ─── TITLE PAGE ────────────────────────────────────────────────
          new Paragraph({
            children: [new TextRun({ text: 'Supply Chain Resilience Game', bold: true, size: 52 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 1440, after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Instructor Guide', size: 40, color: '4472C4' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'For Educators & Session Facilitators', italics: true, size: 28, color: '595959' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 1440 },
          }),

          pageBreak(),

          // ─── 1. OVERVIEW ───────────────────────────────────────────────
          heading1('1. Overview'),
          para(
            'The Supply Chain Resilience Game is a multiplayer simulation where students manage a global supply chain over multiple rounds. ' +
            'Each player acts as a supply chain manager, placing orders from suppliers in three countries — China, Mexico, and the United States — ' +
            'while responding to price pressures, capacity constraints, demand fluctuations, and real-world disruptions (tariffs, port closures, etc.).'
          ),
          para('Learning objectives:'),
          bullet('Understand the cost and risk trade-offs between near-shore and far-shore sourcing'),
          bullet('Experience the "bullwhip effect" as demand signals propagate through the supply chain'),
          bullet('Practice resilience strategies: diversification, buffer inventory, supplier loyalty'),
          bullet('Interpret financial outcomes (revenue, holding costs, order costs, profit)'),
          bullet('Engage in structured debrief discussions supported by real-time data'),

          para('Typical session duration: 45–90 minutes, depending on the number of rounds and debrief depth.'),

          pageBreak(),

          // ─── 2. CREATING A SESSION ─────────────────────────────────────
          heading1('2. Creating a Session'),
          para('From the Instructor Dashboard, click "+ New Session". You will be taken through a configuration form.'),

          heading2('2.1 Session Name'),
          para('Enter a recognisable name, such as the course code or section (e.g. "SCM 301 – Spring Section A"). This name is displayed to players in the lobby.'),

          heading2('2.2 Core Game Parameters'),
          para('These settings define the economic environment all players share:'),
          new Paragraph({ spacing: { after: 120 } }),
          simpleTable(
            ['Parameter', 'Default', 'Description'],
            [
              ['Total Rounds', '30', 'Number of ordering rounds in the game. 20–30 rounds is typical for a class session.'],
              ['Starting Cash', '$200,000', 'Cash each player begins with. Adjust down for higher difficulty.'],
              ['Starting Demand', '1,000 units', 'Each player\'s initial market demand per round.'],
              ['Selling Price', '$60 / unit', 'Revenue per unit sold. Higher price rewards good fill rates.'],
              ['Holding Cost', '$12 / unit', 'Cost per unsold unit remaining in inventory each round.'],
              ['Loyalty %', '50%', 'Fraction of unmet/extra demand that persists to next round. Higher = demand more sensitive to service level.'],
              ['Round Timer', '120 sec', 'Time players have to submit orders each round. Increase for beginners.'],
              ['Disruption Bonus Time', '60 sec', 'Extra seconds added to the timer in rounds where a disruption occurs.'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),

          heading2('2.3 Supplier Costs'),
          para('Each country has a base cost per unit. The unreliable suppliers within each country cost less, but carry cancellation risk.'),
          simpleTable(
            ['Country', 'Default Base Cost', 'Unreliable Cost (default 80%)', 'Transit Time'],
            [
              ['China', '$20 / unit', '$16 / unit', '4 rounds'],
              ['Mexico', '$40 / unit', '$32 / unit', '2 rounds'],
              ['United States', '$80 / unit', '$64 / unit', '1 round'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),
          inlineBold([
            { text: 'Unreliable Cost Modifier: ', bold: true },
            { text: 'Sets how much cheaper unreliable suppliers are (default 0.80 = 20% cheaper). Unreliable suppliers have a default 15% per-order cancellation probability.' },
          ]),

          heading2('2.4 Volume Discounts'),
          para('Discounts are applied per supplier per order automatically:'),
          bullet('Order 400–999 units from a single supplier in one round: 10% discount'),
          bullet('Order 1,000+ units from a single supplier in one round: 25% discount'),

          heading2('2.5 Supplier Capacity'),
          para(
            'Each supplier has a capacity limit. If total player orders exceed that capacity, orders are filled proportionally. ' +
            'Capacity is expressed as a percentage of average demand per player:'
          ),
          bullet('China: 100% of demand per player'),
          bullet('Mexico: 40% of demand per player'),
          bullet('US: 20% of demand per player'),
          para(
            'These defaults reflect real-world constraints — domestic suppliers have limited scale at competitive prices. ' +
            'Advanced capacity parameters (target multiplier, weighting, floor) are available for research scenarios.'
          ),

          pageBreak(),

          // ─── 3. DISRUPTION SCHEDULING ──────────────────────────────────
          heading1('3. Disruption Scheduling'),

          heading2('3.1 What Disruptions Do'),
          para(
            'A disruption prevents all players from placing orders with suppliers in the affected country for its duration. ' +
            'Any orders already in the pipeline to that country are also cancelled. This simulates real-world events such as ' +
            'factory shutdowns, port closures, and geopolitical disruptions.'
          ),
          para('During a disrupted round, players receive bonus time on the round timer to adapt.'),

          heading2('3.2 Default Schedule'),
          para('The game auto-generates a disruption schedule when you create a session with the following defaults:'),
          simpleTable(
            ['Country', 'Number of Disruptions', 'Typical First Onset', 'Duration'],
            [
              ['China', '2', 'Rounds 3–8', '3 rounds each'],
              ['Mexico', '1', 'Rounds 6–15', '3 rounds'],
              ['United States', '0', 'N/A', 'N/A'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),

          heading2('3.3 Using the Disruption Scheduler'),
          para('The scheduler displays a visual grid — rows represent countries, columns represent rounds.'),
          bullet('Click any cell to toggle that round as a disruption start for that country.'),
          bullet('A coloured block extends for the configured duration.'),
          bullet('Click "Randomise Schedule" to generate a new random schedule within the configured constraints.'),
          bullet('You can also manually place disruptions for pedagogical emphasis (e.g., trigger a China disruption early to force student reflection).'),
          para('Tip: China disruptions have the most impact because of the 4-round transit lead time — students who relied heavily on China will feel the squeeze most acutely.'),

          pageBreak(),

          // ─── 4. MANAGING THE LOBBY ─────────────────────────────────────
          heading1('4. Managing the Lobby'),

          heading2('4.1 Sharing the Session Code'),
          para(
            'Once your session is created, a 6-character alphanumeric code is displayed on the session management page. ' +
            'Share this code with your students — they enter it on the game homepage along with their name to join.'
          ),
          para('Session codes use only unambiguous characters (no 0/O, 1/I) to avoid confusion.'),

          heading2('4.2 The Lobby View'),
          para('Players appear in the lobby grid as they join. Each card shows the player\'s name. You can:'),
          bullet('See a live count of connected players.'),
          bullet('Remove a player before the game starts by clicking the "Remove" button on their card.'),

          heading2('4.3 Starting the Game'),
          para('Click "Start Game" once all players have joined. All players will simultaneously move from the lobby to the Initial Setup screen.'),
          para('There is no minimum player count — you can run the game with a single player for demonstration purposes.'),

          pageBreak(),

          // ─── 5. DURING THE GAME ────────────────────────────────────────
          heading1('5. During the Game'),

          heading2('5.1 The Player Status Table'),
          para('The session management page shows a real-time table of all players sorted by cash balance. Columns include:'),
          simpleTable(
            ['Column', 'What It Shows'],
            [
              ['Rank', 'Current standing by cash'],
              ['Player Name', 'The name entered at login'],
              ['Cash', 'Current cash balance (can go negative)'],
              ['Inventory', 'Units on hand at start of this round'],
              ['Demand', 'Market demand this round'],
              ['Status', '"Submitted" (order placed) or "Waiting" (not yet submitted)'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),
          para('Use the search box to find a specific player. The table is paginated at 20 players per page.'),

          heading2('5.2 Monitoring Submissions'),
          para(
            'During the ordering phase, a progress bar shows how many players have submitted their orders. ' +
            'When all players submit — or the timer expires — the round advances automatically to processing and then results.'
          ),

          heading2('5.3 Force Advance'),
          para(
            'If one or more players are taking too long, you can click "Force Advance" to move the session forward. ' +
            'Any players who have not yet submitted will have their previous round\'s orders resubmitted automatically.'
          ),
          para('Use Force Advance sparingly — it is mainly for recovering a stuck session (e.g., a disconnected player).'),

          heading2('5.4 Active Disruptions'),
          para('The session management page prominently displays any countries currently under disruption so you can narrate the event to students.'),

          heading2('5.5 Supplier Capacity Table'),
          para(
            'A table shows each supplier\'s actual capacity and last-round orders.'
          ),

          heading2('5.6 Removing Players During the Game'),
          para(
            'If a student needs to leave mid-game, click "Remove" next to their name in the player table. ' +
            'They will be disconnected and will see a notification on their screen. Removed players cannot rejoin the same session.'
          ),

          pageBreak(),

          // ─── 6. ENDING THE SESSION ─────────────────────────────────────
          heading1('6. Ending the Session'),

          heading2('6.1 Natural Completion'),
          para(
            'After the final configured round, you can move to the Results screen. ' +
            'All players see a leaderboard, performance charts, and have the option to export data.'
          ),

          heading2('6.2 Ending Early'),
          para(
            'Click "End Session Early" to stop the game at any point. This triggers a confirmation dialog. ' +
            'The session transitions to the Results screen and all data collected so far remains accessible.'
          ),

          heading2('6.3 Deleting Sessions'),
          para(
            'Sessions can be deleted from the session list view. Completed and expired sessions can be bulk-deleted. ' +
            'Deleting a session permanently removes all player data — export results first if you need to keep records.' +
            'Sessions are automatically deleted from the server after 30 days.'
          ),

          pageBreak(),

          // ─── 7. DEBRIEF GUIDE ──────────────────────────────────────────
          heading1('7. Running the Debrief'),
          para(
            'The Results page is the centrepiece of the debrief. Navigate there after the game completes. ' +
            'All players can see the same Results page on their own devices, making it easy to discuss charts together.'
          ),

          heading2('7.1 Leaderboard'),
          para('The leaderboard ranks players by adjusted final cash (cash plus the value of remaining inventory). Key metrics shown:'),
          bullet('Final adjusted cash'),
          bullet('Average purchase cost per unit'),
          bullet('Average number of suppliers used per round (diversification)'),
          bullet('Average ending inventory (waste / excess)'),
          bullet('Demand shortfall (cumulative unmet demand)'),
          bullet('Unreliable supplier % (risk appetite)'),

          heading2('7.2 Chart-by-Chart Discussion Prompts'),

          heading3('Cash Over Time'),
          para('Shows each player\'s cash balance every round alongside the group average.'),
          bullet('When did the biggest cash drops occur? Were they correlated with disruptions?'),
          bullet('Which players recovered well after a disruption? What strategy did they use?'),

          heading3('Market Demand Over Time'),
          para('Shows how each player\'s market demand changed. Demand grows when you over-fulfil and shrinks when you under-fulfil.'),
          bullet('Which players grew their demand the most? How did they achieve it?'),
          bullet('Which players saw demand collapse? What caused it?'),

          heading3('China Sourcing % Over Time'),
          para('Shows what percentage of total ordered units came from Chinese suppliers each round.'),
          bullet('How did players react to the China disruption? Did they shift sourcing in advance or scramble reactively?'),
          bullet('What is the right long-term percentage to source from China given the risk?'),

          heading3('Average Unreliable Units Ordered'),
          para('Shows average orders placed with unreliable (cheaper) suppliers over time.'),
          bullet('Did players avoid unreliable suppliers entirely? Were they over-cautious?'),
          bullet('What is the expected cost saving from using unreliable suppliers, and does it justify the cancellation risk?'),

          heading3('Average Purchase Cost Over Time'),
          para('Shows weighted average cost per unit ordered. Lower = more offshore sourcing; higher = more domestic.'),
          bullet('How did disruptions affect sourcing mix and therefore average cost?'),
          bullet('What is the right cost target given demand volatility?'),

          heading3('Average Suppliers Used Per Round'),
          para('Shows how many of the 6 available suppliers each player used on average.'),
          bullet('Single-supplier players: what happened to them during disruptions?'),
          bullet('Multi-supplier players: was there a cost or complexity penalty?'),

          heading3('Average Ending Inventory'),
          para('High ending inventory means holding costs eating into profit. Low inventory means risk of stockouts.'),
          bullet('What is the right inventory buffer size? How does lead time affect this?'),
          bullet('Which sourcing strategy (China-heavy vs. US-heavy) led to more inventory volatility?'),

          heading2('7.3 Exporting Data'),
          para('Two export formats are available from the Results page:'),
          bullet('Excel (.xlsx): Full round-by-round data per player, leaderboard, and chart images. Ideal for further analysis.'),
          bullet('PDF: Chart snapshots with a summary page. Ideal for sharing as a report.'),

          pageBreak(),

          // ─── 8. TROUBLESHOOTING ────────────────────────────────────────
          heading1('8. Troubleshooting'),

          simpleTable(
            ['Issue', 'Cause', 'Resolution'],
            [
              ['Player cannot join — "Session not found"', 'Wrong session code or session expired', 'Verify the 6-character code.'],
              ['Player sees "This session is no longer accepting new players"', 'Game already started and player was not in the original lobby', 'Returning players can reconnect using the same name they originally joined with.'],
              ['Session stuck in ordering phase', 'One or more players disconnected without submitting', 'Click "Force Advance" to move forward using last-round orders for missing players.'],
              ['Session stuck in results phase', 'Players not clicking Confirm', 'Click "Force Next Round" to skip remaining confirmations.'],
              ['Player removed by accident', 'Clicked Remove in error', 'Removed players cannot rejoin. Create a new session or have them observe.'],
              ['Export fails or is slow', 'Large number of players; chart rendering takes time', 'Wait 10–15 seconds. The Excel export is generally faster than PDF.'],
            ]
          ),

          pageBreak(),

          // ─── 9. PARAMETER REFERENCE ────────────────────────────────────
          heading1('9. Full Parameter Reference'),

          simpleTable(
            ['Parameter', 'Default', 'Min', 'Max', 'Notes'],
            [
              ['Total Rounds', '30', '5', '100', 'Typical classroom session: 20–30'],
              ['Starting Cash', '$200,000', '—', '—', 'Adjust to change overall difficulty'],
              ['Starting Demand', '1,000', '—', '—', 'Initial market demand per player'],
              ['Selling Price', '$60', '—', '—', 'Revenue per unit sold to customers'],
              ['Holding Cost', '$12', '—', '—', 'Cost per unit remaining in inventory'],
              ['Loyalty %', '50%', '0%', '100%', 'Higher = demand reacts more to service level'],
              ['Round Timer', '120 s', '30 s', '600 s', 'Increase for introductory classes'],
              ['Disruption Bonus Time', '60 s', '0 s', '300 s', 'Extra timer seconds when disruption occurs'],
              ['China Base Cost', '$20', '—', '—', 'Per-unit cost before discounts'],
              ['Mexico Base Cost', '$40', '—', '—', '—'],
              ['US Base Cost', '$80', '—', '—', '—'],
              ['Unreliable Cost Modifier', '0.80', '—', '—', 'Multiplier applied to unreliable supplier cost'],
              ['Cancellation Chance', '15%', '0%', '100%', 'Per-order probability of unreliable cancellation'],
              ['Min Order', '100 units', '0', '—', 'Minimum allowed order from any single supplier'],
              ['New Supplier Cap', '150 units', '—', '—', 'Max first order to a never-before-used supplier'],
              ['Max Order Increase', '40%', '—', '—', 'Max growth in order size round-over-round'],
              ['China Capacity', '100% / player', '—', '—', 'Supplier capacity relative to avg player demand'],
              ['Mexico Capacity', '40% / player', '—', '—', '—'],
              ['US Capacity', '20% / player', '—', '—', '—'],
            ]
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Instructor_Guide.docx';
  a.click();
  URL.revokeObjectURL(url);
}
