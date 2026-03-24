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

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text })],
    spacing: { after: 120 },
  });
}

function inlineBold(parts: { text: string; bold?: boolean }[]): Paragraph {
  return new Paragraph({
    children: parts.map((p) => new TextRun({ text: p.text, bold: p.bold ?? false })),
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

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

function tableHeader(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })], alignment: AlignmentType.CENTER })],
    shading: { fill: 'E2EFDA' },
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

function calloutBox(label: string, text: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: `${label}  ${text}`, bold: true })],
      spacing: { before: 120, after: 120 },
      shading: { fill: 'FFF2CC' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'F0AD00' } },
      indent: { left: convertInchesToTwip(0.15) },
    }),
  ];
}

export async function downloadPlayerGuide(): Promise<void> {
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
            children: [new TextRun({ text: 'Player Guide', size: 40, color: '375623' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Rules, Strategy, and Round-by-Round Reference', italics: true, size: 28, color: '595959' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 1440 },
          }),

          pageBreak(),

          // ─── 1. WELCOME ────────────────────────────────────────────────
          heading1('1. Welcome'),
          para(
            'You are a supply chain manager. Your goal is to maximise profit over the course of the game ' +
            'by purchasing products from suppliers in China, Mexico, and the United States, selling them to customers, ' +
            'and managing your cash and inventory carefully.'
          ),
          para(
            'Every round you face the same challenge: order the right amount from the right suppliers, ' +
            'before disruptions, capacity shortfalls, or poor forecasting leave you with too much stock — or not enough.'
          ),
          para(
            'At the end of the game, the player with the highest adjusted cash balance (cash + value of remaining inventory) wins.'
          ),

          pageBreak(),

          // ─── 2. SUPPLIERS ──────────────────────────────────────────────
          heading1('2. Your Suppliers'),
          para(
            'You have access to six suppliers — two in each country. Within each country there is one ' +
            'reliable supplier and one unreliable supplier.'
          ),

          new Paragraph({ spacing: { after: 120 } }),
          simpleTable(
            ['Country', 'Supplier Type', 'Base Cost', 'Transit Time', 'Notes'],
            [
              ['China', 'Reliable', '$20 / unit', '4 rounds', 'Cheapest. Long lead time. Subject to disruption.'],
              ['China', 'Unreliable', '$16 / unit', '4 rounds', '20% cheaper. 15% chance order is cancelled.'],
              ['Mexico', 'Reliable', '$40 / unit', '2 rounds', 'Mid-price. Moderate lead time.'],
              ['Mexico', 'Unreliable', '$32 / unit', '2 rounds', '20% cheaper. 15% chance order is cancelled.'],
              ['US', 'Reliable', '$80 / unit', '1 round', 'Most expensive. Fastest delivery. Rarely disrupted.'],
              ['US', 'Unreliable', '$64 / unit', '1 round', '20% cheaper. 15% chance order is cancelled.'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),

          heading2('Reliable vs. Unreliable'),
          para(
            'Reliable suppliers always deliver what you order (subject to capacity). ' +
            'Unreliable suppliers offer a discount, but each order has a 15% chance of being cancelled entirely — ' +
            'you are not charged for a cancelled order, but the capacity is still consumed and you receive nothing.'
          ),

          heading2('Transit Time'),
          para(
            'Orders do not arrive immediately. An order placed this round from China arrives 4 rounds later. ' +
            'Mexico arrives in 2 rounds. US arrives next round. Plan ahead — you need to order China stock ' +
            'long before you expect to need it.'
          ),

          heading2('Volume Discounts'),
          para('Ordering large quantities from a single supplier in one round earns a discount:'),
          bullet('400–999 units ordered: 10% discount'),
          bullet('1,000+ units ordered: 25% discount'),
          para('Discounts are applied automatically in the order summary.'),

          pageBreak(),

          // ─── 3. INITIAL SETUP ──────────────────────────────────────────
          heading1('3. Initial Setup'),
          para(
            'Before Round 1, you will complete an initial setup screen. You must allocate your starting demand ' +
            '(default: 1,000 units) across the six suppliers to seed your supply pipeline.'
          ),
          para('This is important: you are paying for the units to fill the transit pipeline immediately.'),
          bullet('China: you pay for 4 rounds of pipeline immediately (e.g., 100 units × 4 × $20 = $8,000)'),
          bullet('Mexico: you pay for 2 rounds of pipeline immediately'),
          bullet('US: you pay for 1 round of pipeline immediately'),
          para(
            'The setup screen shows your remaining cash as you allocate units. ' +
            'You must allocate exactly your starting demand before you can submit.'
          ),
          ...calloutBox('Tip:', 'Heavy China allocation in setup is cheap per unit, but puts all your eggs in one basket. Consider diversifying your supplier base to have options if China gets disrupted.'),

          pageBreak(),

          // ─── 4. HOW A ROUND WORKS ──────────────────────────────────────
          heading1('4. How a Round Works'),
          para('Each round has three phases:'),

          heading2('Phase 1 — Ordering'),
          para(
            'A countdown timer starts. You have this time to enter your order quantities for each supplier and click "Submit Orders". ' +
            'If the timer expires before you submit, your previous round\'s orders are resubmitted automatically.'
          ),
          para('During this phase you can see:'),
          bullet('Each supplier\'s last order and maximum allowed order'),
          bullet('Your current cash and inventory'),
          bullet('The Pipeline Forecast — a 4-round lookahead showing when your existing orders will arrive'),
          bullet('Live order cost calculations including volume discounts'),

          heading2('Phase 2 — Processing'),
          para(
            'The game engine processes all player orders simultaneously. You cannot change your orders at this point. ' +
            'The system resolves capacity allocation, cancellation checks for unreliable suppliers, and demand fulfillment.'
          ),

          heading2('Phase 3 — Results'),
          para('You see a detailed breakdown of what happened this round:'),
          bullet('Arrivals: which orders arrived in your warehouse'),
          bullet('Orders: what you ordered vs. what was allocated (may differ due to capacity or cancellation)'),
          bullet('Demand: market demand, how much you sold, any unmet demand'),
          bullet('Financials: revenue, order costs, holding costs, and net profit'),
          para('Click "Confirm" to acknowledge your results and move to the next round.'),

          pageBreak(),

          // ─── 5. PLACING ORDERS ─────────────────────────────────────────
          heading1('5. Placing Orders'),

          heading2('The Supplier Grid'),
          para(
            'The game board shows six supplier cards — one for each supplier. Each card shows:'
          ),
          bullet('The supplier\'s country and type (reliable / unreliable)'),
          bullet('The per-unit cost (with volume discount applied as you type)'),
          bullet('"Last order" — how much you ordered last round'),
          bullet('"Max" — the maximum you are allowed to order this round'),

          heading2('The Pipeline Forecast'),
          para(
            'Below the supplier grid, the Pipeline Forecast shows the next 4 rounds. For each round it shows:'
          ),
          bullet('Units arriving from existing orders in transit'),
          bullet('Your projected inventory balance (surplus or shortfall vs. expected demand)'),
          para('Use this panel to avoid over-ordering (which leads to costly inventory) or under-ordering (which leads to stockouts).'),

          heading2('The Order Summary'),
          para('A table below the grid shows total order quantity, average unit cost, and total planned spend for this round.'),

          pageBreak(),

          // ─── 6. ORDER LIMITS ───────────────────────────────────────────
          heading1('6. Order Limits'),
          para('To simulate realistic supplier relationship constraints, your orders are subject to limits:'),

          simpleTable(
            ['Limit', 'Rule', 'Why It Matters'],
            [
              ['New Supplier Cap', 'First order to a new supplier: max 150 units', 'You cannot instantly scale up a brand-new supplier relationship.'],
              ['Growth Cap', 'Each round: your order can have a max 40% increase over your last order', 'Suppliers need advance notice for large increases. Plan gradual ramp-ups.'],
              ['Minimum Order', 'If ordering at all: minimum 100 units (or 0)', 'You cannot place a token order of 1–99 units.'],
              ['Disruption Block', 'Cannot order from a disrupted country', 'Orders are cancelled system-wide during active disruptions.'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),
          ...calloutBox('Important:', 'Because you can only grow orders 40% per round, you cannot suddenly double them once the disruption ends. Also, suppliers plan their capacity based on your orders. If you have been ordering 100 units from Mexico and suddenly try to order 140, you will likely face a capacity shortage and receive fewer units than you ordered.'),

          pageBreak(),

          // ─── 7. DISRUPTIONS ────────────────────────────────────────────
          heading1('7. Disruptions'),
          para(
            'Disruptions are scheduled events that simulate real-world supply chain shocks — ' +
            'factory shutdowns, port closures, geopolitical events. ' +
            'When a disruption strikes a country, ALL players are affected equally.'
          ),

          heading2('What Happens During a Disruption'),
          bullet('A banner appears at the top of the game board showing which country is disrupted.'),
          bullet('You cannot place any new orders with suppliers in that country for the duration.'),
          bullet('Any outstanding orders in the pipeline from that country remain in the pipeline, and you will see them progressing towards your warehouse.'),
          bullet('After a disruption you receive an extra minute bonus time on the ordering timer to adjust your orders.'),

          heading2('Duration'),
          para('Disruptions typically last 3 rounds. The banner will show how many rounds remain.'),

          heading2('How to Prepare'),
          bullet('Maintain buffer inventory to cover 2–4 rounds of demand.'),
          bullet('Diversify your sourcing across countries so no single disruption cuts off your entire supply.'),
          bullet('Monitor your pipeline forecast — if China is disrupted, you can shift orders to Mexico/US with shorter lead times.'),

          pageBreak(),

          // ─── 8. YOUR FINANCES ──────────────────────────────────────────
          heading1('8. Your Finances'),

          heading2('Revenue'),
          para('Each round you sell inventory to meet your market demand:'),
          inlineBold([
            { text: 'Revenue = Units Sold × $60 (selling price)', bold: true },
          ]),
          para('You can only sell units you have in inventory. You cannot sell units that are still in transit.'),

          heading2('Order Costs'),
          para('You pay for allocated units at the end of each round:'),
          inlineBold([
            { text: 'Order Cost = Allocated Units × Unit Cost (after discounts)', bold: true },
          ]),
          para('You are NOT charged for cancelled unreliable orders.'),

          heading2('Holding Costs'),
          para('Any units remaining in your warehouse at the end of a round incur a holding cost:'),
          inlineBold([
            { text: 'Holding Cost = Ending Inventory × $12 per unit', bold: true },
          ]),
          para('This penalises over-ordering — carrying excess stock is expensive.'),

          heading2('Profit Formula'),
          inlineBold([
            { text: 'Profit = Revenue − Order Costs − Holding Costs', bold: true },
          ]),
          para('Your cash balance updates each round. Cash can go negative (you are effectively taking on debt).'),

          pageBreak(),

          // ─── 9. DEMAND MECHANICS ───────────────────────────────────────
          heading1('9. Demand Mechanics'),
          para(
            'Your market demand is not fixed — it changes based on how well you serve your customers. ' +
            'This is governed by the "loyalty" mechanic. The game has a Loyalty % (default 50%) that determines how much of your demand you keep even if you fail to meet it.'
          ),

          heading2('Unmet Demand (Stockout)'),
          para(
            'If your inventory is lower than your market demand, you have a stockout. ' +
            'Customers who couldn\'t buy from you are lost — your market demand shrinks next round.'
          ),
          inlineBold([
            { text: 'Lost Demand = Unmet Units × (1 − Loyalty %) = Unmet Units × 50%', bold: true },
          ]),
          para('Example: You had demand of 1,000 but only 800 in stock. You lose 100 units of future demand.'),

          heading2('Extra Fulfilled Demand'),
          para(
            'If you have more inventory than your demand, leftover units may fulfil other players\' unmet demand (via a market pool). ' +
            'Successfully serving extra customers grows your market demand for the next round.'
          ),
          inlineBold([
            { text: 'New Demand Gained = Extra Sold × (1 − Loyalty %) = Extra Sold × 50%', bold: true },
          ]),

          heading2('Key Insight'),
          ...calloutBox('Remember:', 'Demand is your lifeblood. Letting it shrink through repeated stockouts creates a downward spiral — less demand means less revenue even when supply recovers. Protect your fill rate.'),

          pageBreak(),

          // ─── 10. THE RESULTS SCREEN ────────────────────────────────────
          heading1('10. The Results Screen'),
          para('After each round, you see a detailed results overlay. Here is how to read it:'),

          simpleTable(
            ['Section', 'What It Shows'],
            [
              ['Arrivals', 'Units that arrived in your warehouse from transit this round'],
              ['Orders', 'Per-supplier table: units ordered, units allocated, and status (Full / Partial / Cancelled / Capacity Shortage)'],
              ['Demand', 'Market demand this round, units sold, unmet demand, and any extra demand gained'],
              ['Financials', 'Revenue, order costs, holding costs, and net profit for this round'],
            ]
          ),
          new Paragraph({ spacing: { after: 120 } }),
          para('Click "Confirm" once you have reviewed your results. The next round will begin when all players confirm (or the instructor advances).'),

          pageBreak(),

          // ─── 11. STRATEGY TIPS ─────────────────────────────────────────
          heading1('11. Strategy Tips'),

          heading2('You can Loose Supply in Three Ways'),
          para(
            'Regions get disrupted which means you cannot place orders with suppliers in that region.' +
            'Unreliable suppliers may cancel your order, in which case nothing is shipped.' +
            'Suppliers that face sudden jumps in demand may not have enough capacity and will allocate their scarce capacity based on order volume.'
          ),
          
          heading2('Diversify Your Suppliers'),
          para(
            'Relying entirely on China is tempting (low cost), but a single disruption can cut off your supply for 3+ rounds. ' +
            'Keep at least some capacity in Mexico or the US as insurance.'
          ),

          heading2('Do not Game the Ending'),
          para(
            'The game ends after 30 rounds, but we count your total value of inventory in the supply pipeline in the end (at cost).' +
            'You do not need to stop ordering just because the game is ending soon.'
          ),
          
          heading2('Use the Pipeline Forecast'),
          para(
            'The 4-round lookahead is your most valuable tool. Before submitting, check whether your incoming pipeline ' +
            'will meet your projected demand. If you see a shortfall in 2 rounds, order more from Mexico or the US now — not from China (it\'s too slow).' +
            'Nothing you order will help you face the demand in the current round, even the supplies from the US take one round to arrive.'
          ),

          heading2('Ramp Up Gradually'),
          para(
            'You can only increase orders 40% per round. If you expect that you will need more supplie, ' +
            'start increasing orders several rounds in advance.'
          ),

          heading2('Watch the Timer'),
          para(
            'If the timer expires, your previous orders are automatically resubmitted. This can be a safe fallback, ' +
            'but may not reflect current conditions (e.g., a disruption has just ended, or your demand has changed).'
          ),

          heading2('Balance Inventory and Cash'),
          para(
            'Holding too much inventory drains cash through holding costs ($12/unit/round). ' +
            'Holding too little risks stockouts and demand loss.'
          ),

          heading2('Think About Unreliable Suppliers'),
          para(
            'Unreliable suppliers are 20% cheaper but have a 15% cancellation rate. Over many rounds, the expected savings ' +
            'can be significant — but a cancellation at the wrong time (during a demand spike or when your buffer is low) ' +
            'can be very costly. Consider using them for orders where you have buffer to absorb a cancellation.'
          ),

          pageBreak(),

          // ─── 12. QUICK REFERENCE ───────────────────────────────────────
          heading1('12. Quick Reference'),

          heading2('Costs & Revenue'),
          simpleTable(
            ['Item', 'Default Value'],
            [
              ['Selling Price', '$60 / unit'],
              ['Holding Cost', '$12 / unit / round'],
              ['China Reliable', '$20 / unit'],
              ['China Unreliable', '$16 / unit'],
              ['Mexico Reliable', '$40 / unit'],
              ['Mexico Unreliable', '$32 / unit'],
              ['US Reliable', '$80 / unit'],
              ['US Unreliable', '$64 / unit'],
            ]
          ),
          new Paragraph({ spacing: { after: 240 } }),

          heading2('Transit Times'),
          simpleTable(
            ['Country', 'Rounds Until Arrival'],
            [
              ['China', '4 rounds'],
              ['Mexico', '2 rounds'],
              ['United States', '1 round'],
            ]
          ),
          new Paragraph({ spacing: { after: 240 } }),

          heading2('Order Rules'),
          simpleTable(
            ['Rule', 'Value'],
            [
              ['New supplier (first order)', 'Max 150 units'],
              ['Existing supplier growth cap', 'Max 40% increase per round'],
              ['Minimum order', '100 units (or 0)'],
              ['Volume discount — 400+ units', '10% off'],
              ['Volume discount — 1,000+ units', '25% off'],
              ['Unreliable cancellation chance', '15% per order'],
            ]
          ),
          new Paragraph({ spacing: { after: 240 } }),

          heading2('Disruptions'),
          simpleTable(
            ['Item', 'Default'],
            [
              ['China disruptions per game', '2'],
              ['Mexico disruptions per game', '1'],
              ['US disruptions per game', '0'],
              ['Duration', '3 rounds each'],
              ['Bonus timer added', '+60 seconds'],
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
  a.download = 'Player_Guide.docx';
  a.click();
  URL.revokeObjectURL(url);
}
